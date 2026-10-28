import './model-ui.js';
const $ = id => document.getElementById(id);
let roles = [], resources = [], kind = 'general', editing = null, editingRole = false;
const fields = { general:['版本 / 变体','等级','进阶','兵种','备注'], tactic:['研究状态','可用数量','当前占用','备注'], treasure:['品质','等级','词条','当前装备武将','备注'] };
const labels = {general:'武将',tactic:'战法',treasure:'宝物'};
async function api(path, method='GET', data) {
  const response = await fetch(`/api${path}`, {method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const result = await response.json(); if(!response.ok)throw Error(result.error); return result;
}
function notice(text=''){ $('message').textContent=text; }
function guard(fn){return async (...args)=>{try{await fn(...args);}catch(e){notice(e.message);}};}
const current = ()=>$('roles').value;
async function loadRoles(selected=current()) {
  roles = await api('/roles'); $('roles').replaceChildren();
  if(!roles.length)$('roles').append(new Option('请先新建角色',''));
  for(const r of roles)$('roles').append(new Option(r.name,r.id));
  if(roles.some(r=>r.id===selected))$('roles').value=selected;
  await loadResources();
}
async function loadResources(){
  const id=current(); resources=id?await api(`/roles/${id}/resources`):[];
  const r=roles.find(r=>r.id===id);$('roleInfo').textContent=r?`服务器：${r.server||'未填写'} · 赛季 / 剧本：${r.season||'未填写'}`:'';render();window.dispatchEvent(new Event('role-resources-changed'));
}
function render(){
  const query=$('search').value.trim();const list=resources.filter(r=>r.kind===kind&&r.name.includes(query));
  $('count').textContent=`${list.length} 条${labels[kind]}`;$('resources').replaceChildren();$('empty').hidden=!!list.length;
  $('empty').textContent=current()?'暂无匹配资源，点击“新增资源”开始录入。':'新建角色后，添加你的第一条资源。';
  for(const r of list){const tr=document.createElement('tr');
    for(const value of [r.name,Object.entries(r.attributes).map(([k,v])=>`${k}：${typeof v==='object'?JSON.stringify(v):v}`).join('\n')||'未填写',r.verified?'已核对':'待核对']){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    const actions=document.createElement('td');const edit=document.createElement('button');edit.textContent='编辑';edit.onclick=()=>openResource(r);
    const del=document.createElement('button');del.textContent='删除';del.onclick=guard(async()=>{if(!confirm(`确定删除“${r.name}”？`))return;await api(`/roles/${current()}/resources/${r.id}`,'DELETE',{revision:r.revision});await loadResources();notice('已删除，修改记录保存在数据库中。');});actions.append(edit,del);tr.append(actions);$('resources').append(tr);
  }
}
function openResource(r=null){
  if(!current()){notice('请先新建角色。');return;}editing=r;$('resourceForm').reset();$('fields').replaceChildren();
  $('resourceTitle').textContent=`${r?'编辑':'新增'}${labels[kind]}`;
  const attrs={...(r?.attributes||{})};
  fields[kind].forEach((name,i)=>{const label=document.createElement('label');label.textContent=name;const input=document.createElement('input');input.name=`attr${i}`;input.maxLength=2000;input.value=typeof attrs[name]==='string'?attrs[name]:attrs[name]==null?'':JSON.stringify(attrs[name]);delete attrs[name];label.append(input);$('fields').append(label);});
  $('resourceForm').elements.name.value=r?.name||'';$('resourceForm').elements.verified.checked=!!r?.verified;
  $('resourceForm').elements.extra.value=Object.keys(attrs).length?JSON.stringify(attrs,null,2):'';$('resourceDialog').showModal();
}
function openRole(edit){editingRole=edit;$('roleForm').reset();const r=edit?roles.find(r=>r.id===current()):null;if(edit&&!r){notice('请先新建角色。');return;}
  $('roleTitle').textContent=edit?'修改角色 / 赛季':'新建角色';for(const key of ['name','server','season'])$('roleForm').elements[key].value=r?.[key]||'';$('roleDialog').showModal();}
$('newRole').onclick=()=>openRole(false);$('editRole').onclick=()=>openRole(true);
$('roleForm').onsubmit=guard(async event=>{event.preventDefault();const f=$('roleForm').elements;const input={name:f.name.value,server:f.server.value,season:f.season.value};let id=current();if(editingRole)await api(`/roles/${id}`,'PUT',input);else id=(await api('/roles','POST',input)).id;$('roleDialog').close();await loadRoles(id);notice('角色已保存。');});
$('resourceForm').onsubmit=guard(async event=>{event.preventDefault();const f=$('resourceForm').elements;let attributes={};try{attributes=f.extra.value.trim()?JSON.parse(f.extra.value):{};}catch{throw Error('其他属性不是有效 JSON。');}if(!attributes||Array.isArray(attributes)||typeof attributes!=='object')throw Error('其他属性必须为 JSON 对象。');fields[kind].forEach((name,i)=>{if(f[`attr${i}`].value.trim())attributes[name]=f[`attr${i}`].value.trim();});const input={kind,name:f.name.value,attributes,verified:f.verified.checked};if(editing)input.revision=editing.revision;await api(`/roles/${current()}/resources${editing?`/${editing.id}`:''}`,editing?'PUT':'POST',input);$('resourceDialog').close();await loadResources();notice('资源已保存到本机 MySQL。');});
$('roles').onchange=guard(loadResources);$('add').onclick=()=>openResource();$('search').oninput=render;
document.querySelectorAll('[data-kind]').forEach(button=>button.onclick=()=>{kind=button.dataset.kind;document.querySelectorAll('[data-kind]').forEach(b=>b.classList.toggle('active',b===button));render();});
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
$('export').onclick=guard(async()=>{if(!current())throw Error('请先选择角色');const data=await api(`/roles/${current()}/export`);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`stzb-${current()}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已导出当前角色资源；备份不包含数据库修改历史。');});
$('import').onchange=guard(async()=>{const file=$('import').files[0];$('import').value='';if(!file)return;if(file.size>8*1024*1024)throw Error('文件超过8MB');const data=JSON.parse(await file.text());if(!confirm('导入将创建一个新的独立角色副本，是否继续？'))return;const r=await api('/import','POST',data);await loadRoles(r.id);notice('备份已导入为新角色。');});
await guard(loadRoles)();
