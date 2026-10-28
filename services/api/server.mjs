import http from 'node:http';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { config, openDatabase } from './database.mjs';
import { assert, roleInput, resourceInput, importInput } from './validation.mjs';
import { modelConfig, publicConfig, saveModelConfig, callModel, requestInput, buildMessages, validatePlan } from './model.mjs';

const c = config();
const port = Number(process.env.STZB_PORT || c.server?.port || 8765);
const pool = await openDatabase();
const web = new URL('../../apps/web/', import.meta.url);
let modelBusy = false;
async function withModel(res, work) {
  assert(!modelBusy,'已有模型请求在进行，请等待完成或取消',409);
  modelBusy=true;const controller=new AbortController();
  const close=()=>{if(!res.writableEnded)controller.abort();};res.once('close',close);
  try{return await work(controller.signal);}finally{res.off('close',close);modelBusy=false;}
}
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; assert(size <= 8 * 1024 * 1024, '请求过大', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { assert(false, 'JSON 格式错误'); }
}
async function transaction(fn) {
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); const result = await fn(conn); await conn.commit(); return result; }
  catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
async function getRole(db, id) {
  const [rows] = await db.execute('SELECT id,name,server_name AS server,season FROM roles WHERE id=?', [id]);
  assert(rows.length, '角色不存在', 404); return rows[0];
}
async function insertResource(db, roleId, r, action = 'create') {
  const id = randomUUID();
  await db.execute('INSERT INTO resources(id,role_id,kind,name,attributes,verified) VALUES(?,?,?,?,?,?)', [id, roleId, r.kind, r.name, JSON.stringify(r.attributes), r.verified]);
  await audit(db, roleId, id, action, r); return id;
}
async function audit(db, roleId, id, action, snapshot) {
  await db.execute('INSERT INTO resource_changes(role_id,resource_id,action,snapshot) VALUES(?,?,?,?)', [roleId, id, action, JSON.stringify(snapshot)]);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const host = `127.0.0.1:${port}`;
    assert(req.headers.host === host || req.headers.host === `localhost:${port}`, '访问地址无效', 403);
    if (!['GET', 'HEAD'].includes(req.method)) {
      assert(!req.headers.origin || [`http://${host}`, `http://localhost:${port}`].includes(req.headers.origin), '拒绝跨站写入', 403);
      assert(req.headers['content-type']?.startsWith('application/json'), '需要 application/json', 415);
    }
    const url = new URL(req.url, `http://${host}`);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api') {
      assert(req.method === 'GET', '方法不允许', 405);
      const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/model-ui.js':['model-ui.js','text/javascript'], '/style.css': ['style.css','text/css'] };
      const file = assets[url.pathname]; assert(file, '页面不存在', 404);
      res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(await fs.readFile(new URL(file[0], web))); return;
    }
    if (url.pathname === '/api/roles' && req.method === 'GET') {
      const [rows] = await pool.query('SELECT id,name,server_name AS server,season FROM roles ORDER BY created_at,id'); return send(res, 200, rows);
    }
    if (url.pathname === '/api/model/config' && req.method === 'GET') return send(res,200,publicConfig(await modelConfig()));
    if (url.pathname === '/api/model/config' && req.method === 'PUT') return send(res,200,await saveModelConfig(await body(req)));
    if (url.pathname === '/api/model/test' && req.method === 'POST') {
      await body(req);
      const answer=await withModel(res,async signal=>callModel(await modelConfig(),[{role:'user',content:'请仅返回 JSON 对象 {"ok":true}，这是连接测试。'}],{signal,test:true}));
      return send(res,200,{ok:true,usage:answer.usage});
    }
    if (url.pathname === '/api/roles' && req.method === 'POST') {
      const r = roleInput(await body(req)); const id = randomUUID();
      await pool.execute('INSERT INTO roles(id,name,server_name,season) VALUES(?,?,?,?)', [id,r.name,r.server,r.season]); return send(res, 201, {id});
    }
    if (url.pathname === '/api/import' && req.method === 'POST') {
      const input = importInput(await body(req)); const id = randomUUID();
      await transaction(async db => {
        await db.execute('INSERT INTO roles(id,name,server_name,season) VALUES(?,?,?,?)', [id,input.role.name,input.role.server,input.role.season]);
        for (const r of input.resources) await insertResource(db,id,r,'import');
      }); return send(res,201,{id});
    }
    if (parts[1] === 'roles' && parts[2]) {
      const roleId = parts[2];
      await getRole(pool, roleId);
      if (parts[3] === 'recommendations' && parts.length === 4) {
        if (req.method === 'GET') {
          const [rows]=await pool.execute('SELECT id,request_data,snapshot,model_info,result,usage_data,created_at FROM recommendations WHERE role_id=? ORDER BY created_at DESC LIMIT 20',[roleId]);
          return send(res,200,rows);
        }
        if (req.method === 'POST') {
          const request=requestInput(await body(req));
          const snapshot=await transaction(async db=>{
            const role=await getRole(db,roleId);
            const [rows]=await db.execute('SELECT id,kind,name,attributes,revision,verified FROM resources WHERE role_id=? AND verified=TRUE ORDER BY id',[roleId]);
            return {role,resources:rows,captured_at:new Date().toISOString(),knowledge_version:null};
          });
          assert(snapshot.role.season.trim(),'请先填写角色的赛季 / 剧本');
          assert(snapshot.resources.filter(r=>r.kind==='general').length>=3,'请先添加并核对至少3名武将');
          const messages=buildMessages(snapshot,request);
          const settings=await modelConfig();
          const answer=await withModel(res,signal=>callModel(settings,messages,{signal}));
          const result=validatePlan(answer.text,snapshot,request);
          const id=randomUUID();const modelInfo={base_url:settings.base_url,model:settings.model,json_mode:settings.json_mode,prompt_version:1};
          await pool.execute('INSERT INTO recommendations(id,role_id,snapshot,request_data,model_info,result,usage_data) VALUES(?,?,?,?,?,?,?)',[id,roleId,JSON.stringify(snapshot),JSON.stringify(request),JSON.stringify(modelInfo),JSON.stringify(result),JSON.stringify(answer.usage)]);
          return send(res,201,{id,...result,usage:answer.usage,snapshot});
        }
      }
      if (parts.length === 3 && req.method === 'PUT') {
        const r = roleInput(await body(req)); await pool.execute('UPDATE roles SET name=?,server_name=?,season=? WHERE id=?',[r.name,r.server,r.season,roleId]); return send(res,200,{ok:true});
      }
      if (parts[3] === 'export' && req.method === 'GET') {
        const snapshot = await transaction(async db => {
          const role = await getRole(db, roleId);
          const [resources] = await db.execute('SELECT kind,name,attributes,verified FROM resources WHERE role_id=? ORDER BY id',[roleId]);
          return { version:1, exported_at:new Date().toISOString(), role, resources:resources.map(r=>({...r,verified:!!r.verified})) };
        }); return send(res,200,snapshot);
      }
      if (parts[3] === 'resources') {
        if (parts.length === 4 && req.method === 'GET') {
          const [rows] = await pool.execute('SELECT * FROM resources WHERE role_id=? ORDER BY updated_at DESC,id',[roleId]);
          return send(res,200,rows.map(r=>({...r,verified:!!r.verified})));
        }
        if (parts.length === 4 && req.method === 'POST') {
          const r = resourceInput(await body(req)); const id = await transaction(db=>insertResource(db,roleId,r)); return send(res,201,{id});
        }
        if (parts.length === 5 && ['PUT','DELETE'].includes(req.method)) {
          const input = await body(req); assert(Number.isInteger(input.revision), '缺少版本号');
          const r = req.method === 'PUT' ? resourceInput(input) : null;
          await transaction(async db => {
            const [rows] = await db.execute('SELECT * FROM resources WHERE id=? AND role_id=? FOR UPDATE',[parts[4],roleId]);
            assert(rows.length,'资源不存在',404); const old = rows[0]; assert(old.revision===input.revision,'数据已变化，请刷新后重试',409);
            if (r) await db.execute('UPDATE resources SET kind=?,name=?,attributes=?,verified=?,revision=revision+1 WHERE id=?',[r.kind,r.name,JSON.stringify(r.attributes),r.verified,old.id]);
            else await db.execute('DELETE FROM resources WHERE id=?',[old.id]);
            await audit(db,roleId,old.id,r?'update':'delete',{before:old,after:r});
          }); return send(res,200,{ok:true});
        }
      }
    }
    assert(false,'接口不存在',404);
  } catch (e) {
    if (!e.status) console.error('请求失败:', e.code || e.name);
    send(res,e.status||500,{error:e.status?e.message:'服务处理失败，请检查本地数据库连接'});
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`率土资源管理：http://127.0.0.1:${port}（MySQL）`));
async function stop(){server.close();await pool.end();process.exit();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
