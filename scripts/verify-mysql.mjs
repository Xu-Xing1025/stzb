import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import { openDatabase } from '../services/api/database.mjs';
const port=18765, base=`http://127.0.0.1:${port}/api`;
let child;const roleIds=[];let modelCalls=0;
await fs.mkdir('work',{recursive:true});
const fakeConfig='work/model-integration.json';
const provider=http.createServer(async(req,res)=>{
  let input='';for await(const chunk of req)input+=chunk;
  const data=JSON.parse(input);modelCalls++;
  let content='{"ok":true}';
  if(data.messages.length>1){
    const context=JSON.parse(data.messages[1].content);
    const generals=context.resources.filter(r=>r.kind==='general');
    content=JSON.stringify({summary:'测试服务返回',warnings:[],teams:[{name:'测试队',reason:'只验证调用链',members:['大营','中军','前锋'].map((position,i)=>({position,general_id:generals[i].id,tactic_ids:[],treasure_id:null,advice:'测试'}))}]});
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}],usage:{total_tokens:12}}));
});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
async function start(){
  child=spawn(process.execPath,['services/api/server.mjs'],{env:{...process.env,STZB_PORT:String(port),NODE_ENV:'test',STZB_TEST_MODEL_CONFIG:fakeConfig,STZB_MODEL_API_KEY:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error(`Server exited ${code}`)));});
}
async function stop(){if(child&&!child.killed){await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}}
async function request(path,method='GET',data){const res=await fetch(base+path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});return{status:res.status,data:await res.json()};}
try{
  await start();
  for(const name of ['验证角色A','验证角色B']){const r=await request('/roles','POST',{name,server:'测试服',season:'测试赛季'});assert.equal(r.status,201);roleIds.push(r.data.id);}
  const [a,b]=roleIds;
  const settings={base_url:`http://127.0.0.1:${provider.address().port}/v1`,model:'fake-model',api_key:'fake-integration-key',timeout_seconds:10,max_output_tokens:512,token_parameter:'max_tokens',json_mode:true};
  const settingsResponse=await request('/model/config','PUT',settings);assert.equal(settingsResponse.status,200);assert.ok(!JSON.stringify(settingsResponse).includes('fake-integration-key'));
  assert.equal((await request('/model/test','POST',{})).status,200);
  const r=await request(`/roles/${a}/resources`,'POST',{name:'验证武将',kind:'general',attributes:{进阶:'3'},verified:true});assert.equal(r.status,201);
  const id=r.data.id;
  assert.equal((await request(`/roles/${b}/resources`)).data.length,0);
  assert.equal((await request(`/roles/${b}/resources/${id}`,'DELETE',{revision:1})).status,404);
  assert.equal((await request(`/roles/${a}/resources/${id}`,'PUT',{name:'已校正',kind:'general',attributes:{进阶:'4'},verified:true,revision:1})).status,200);
  assert.equal((await request(`/roles/${a}/resources/${id}`,'DELETE',{revision:1})).status,409);
  await stop();await start();
  const saved=(await request(`/roles/${a}/resources`)).data[0];assert.equal(saved.name,'已校正');assert.equal(saved.revision,2);
  const exported=(await request(`/roles/${a}/export`)).data;
  const bad=structuredClone(exported);bad.resources.push({kind:'bad'});assert.equal((await request('/import','POST',bad)).status,400);
  const imported=await request('/import','POST',exported);assert.equal(imported.status,201);roleIds.push(imported.data.id);
  const copied=(await request(`/roles/${imported.data.id}/export`)).data;
  assert.deepEqual(copied.resources,exported.resources);
  for(const name of ['武将B','武将C'])await request(`/roles/${a}/resources`,'POST',{name,kind:'general',attributes:{},verified:true});
  const denied=await request(`/roles/${a}/recommendations`,'POST',{team_count:1,goal:'测试',consent:false});assert.equal(denied.status,400);assert.equal(modelCalls,1);
  const recommendation=await request(`/roles/${a}/recommendations`,'POST',{team_count:1,goal:'测试',consent:true});assert.equal(recommendation.status,201);assert.equal(recommendation.data.validation.passed,true);assert.equal(modelCalls,2);
  await stop();await start();
  const history=(await request(`/roles/${a}/recommendations`)).data;assert.equal(history.length,1);assert.equal(history[0].model_info.model,'fake-model');assert.equal((await request(`/roles/${b}/recommendations`)).data.length,0);
  assert.equal((await request(`/roles/${a}/resources/${id}`,'DELETE',{revision:2})).status,200);
  const blocked=await fetch(base+'/roles',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify({name:'blocked'})});assert.equal(blocked.status,403);
  const page=await fetch(`http://127.0.0.1:${port}/`);assert.equal(page.status,200);assert.match(await page.text(),/MySQL/);
  console.log('PASS: MySQL CRUD, role isolation, revision conflict, restart persistence, import/export, malformed import, cross-origin protection, page delivery, model config secret masking, mock provider calls, consent and recommendation history. No real model was called.');
}finally{
  await stop();await new Promise(resolve=>provider.close(resolve));await fs.rm(fakeConfig,{force:true});const db=await openDatabase();try{for(const id of roleIds){await db.execute('DELETE FROM recommendations WHERE role_id=?',[id]);await db.execute('DELETE FROM resource_changes WHERE role_id=?',[id]);await db.execute('DELETE FROM resources WHERE role_id=?',[id]);await db.execute('DELETE FROM roles WHERE id=?',[id]);}}finally{await db.end();}
}
