const root=document.createElement('section');root.className='model-section';
root.innerHTML=`<h2>智能配将</h2><p class="muted">仅使用当前角色已核对资源。游戏资料库尚未建立，模型建议需人工核实，不表示已验证赛季规则或实战强度。</p>
<details><summary>模型连接设置</summary><form id="modelForm" class="model-grid">
<label>基础地址<input name="base_url" type="url" required placeholder="https://服务商地址/v1"></label><label>模型名称<input name="model" required maxlength="150" placeholder="填写服务商实际开放的模型ID"></label>
<label>API 密钥（留空保留原密钥）<input name="api_key" type="password" autocomplete="new-password" maxlength="2000"></label><label class="check"><input name="clear_key" type="checkbox">清除本地密钥（不清除环境变量）</label>
<label>超时（秒）<input name="timeout_seconds" type="number" min="10" max="180" required></label><label>最大输出 tokens<input name="max_output_tokens" type="number" min="128" max="16000" required></label>
<label>输出上限参数<select name="token_parameter"><option value="max_completion_tokens">max_completion_tokens</option><option value="max_tokens">max_tokens（部分兼容服务）</option></select></label><label class="check"><input name="json_mode" type="checkbox">启用 JSON 模式（服务需支持）</label>
<div><button class="primary" type="submit">保存连接设置</button> <button id="testModel" type="button">测试已保存的连接</button></div></form><p class="muted">设置保存在本机 config/model.local.json，不随 Git 提交；密钥不回显。服务地址请填写到 /v1 等基础路径，程序追加 /chat/completions。连接测试会产生少量调用费用。不会自动重试。</p></details>
<p id="modelStatus" role="status"></p><form id="planForm"><div class="toolbar"><label>队伍数量 <input name="team_count" type="number" value="1" min="1" max="5" required></label></div><label>用途与限制<textarea name="goal" rows="3" required maxlength="2000" placeholder="例如：征服赛季打架，优先稳定，说明资源缺口与替代选择。"></textarea></label><label class="check"><input name="consent" type="checkbox" required>允许将赛季、用途与已核对资源发送到上述模型服务（可能产生费用，不发送游戏凭据或图片）</label><button class="primary" id="generate">生成配将建议</button> <button type="button" id="cancelModel" disabled>取消请求</button></form>
<div class="toolbar"><button id="loadHistory">查看当前角色最近20次结果</button><span class="muted">历史结果基于当时快照，修改资源后需重新生成。</span></div><div id="planResults"></div>`;
document.querySelector('main').append(root);
const $=id=>document.getElementById(id);let controller=null;
async function api(path,method='GET',data,signal){const r=await fetch('/api'+path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal});const json=await r.json();if(!r.ok)throw Error(json.error);return json;}
const status=text=>{$('modelStatus').textContent=text;};
function action(fn){return async event=>{event?.preventDefault();try{await fn(event);}catch(e){status(e.name==='AbortError'?'请求已取消，服务商仍可能计费。':e.message);}};}
function fill(c){const f=$('modelForm').elements;for(const k of ['base_url','model','timeout_seconds','max_output_tokens','token_parameter'])f[k].value=c[k]??'';f.json_mode.checked=c.json_mode;f.api_key.value='';f.clear_key.checked=false;status(c.key_configured?`已配置密钥${c.key_from_environment?'（来自环境变量）':''}；保存配置不代表连接测试通过。`:'尚未配置密钥。请填写服务地址、模型名和密钥。');}
function busy(on){$('generate').disabled=on;$('testModel').disabled=on;$('cancelModel').disabled=!on;}
$('modelForm').onsubmit=action(async()=>{const f=$('modelForm').elements;fill(await api('/model/config','PUT',{base_url:f.base_url.value,model:f.model.value,api_key:f.api_key.value,clear_key:f.clear_key.checked,timeout_seconds:Number(f.timeout_seconds.value),max_output_tokens:Number(f.max_output_tokens.value),token_parameter:f.token_parameter.value,json_mode:f.json_mode.checked}));});
async function run(fn){controller=new AbortController();busy(true);try{await fn(controller.signal);}finally{controller=null;busy(false);}}
$('testModel').onclick=action(()=>run(async signal=>{status('正在测试已保存的模型连接…');const result=await api('/model/test','POST',{},signal);status('连接成功，模型已返回文本。'+(result.usage?` 用量：${JSON.stringify(result.usage)}`:''));}));
$('cancelModel').onclick=()=>controller?.abort();
function paragraph(parent,text,cls){const p=document.createElement('p');p.textContent=text;if(cls)p.className=cls;parent.append(p);}
function render(result,snapshot,usage,heading){
  const article=document.createElement('article');article.className='plan-card';const h=document.createElement('h3');h.textContent=heading;article.append(h);
  paragraph(article,result.validation.passed?'资源约束检查通过；游戏机制和实战强度仍待验证。':'未通过资源校验，此结果不能直接使用。',result.validation.passed?'':'error');
  paragraph(article,`快照时间：${snapshot.captured_at||'未知'}；适用角色：${snapshot.role.name}；赛季：${snapshot.role.season}`,'muted');
  paragraph(article,result.plan.summary);
  for(const warning of [...result.validation.errors,...result.plan.warnings])paragraph(article,'• '+warning,'muted');
  const byId=new Map(snapshot.resources.map(r=>[r.id,r]));const name=id=>byId.get(id)?.name||'无效资源';
  for(const team of result.plan.teams){const t=document.createElement('h4');t.textContent=team.name;article.append(t);paragraph(article,team.reason);for(const m of team.members)paragraph(article,`${m.position}：${name(m.general_id)}｜额外战法：${m.tactic_ids.map(name).join('、')||'未配置'}｜宝物：${m.treasure_id?name(m.treasure_id):'未配置'}\n${m.advice}`);}
  if(usage)paragraph(article,'服务商报告用量：'+JSON.stringify(usage),'muted');$('planResults').append(article);
}
$('planForm').onsubmit=action(()=>run(async signal=>{const roleId=$('roles').value;if(!roleId)throw Error('请先选择角色');const f=$('planForm').elements;$('planResults').replaceChildren();status('正在读取已核对资源并生成建议，请稍候…');const result=await api(`/roles/${roleId}/recommendations`,'POST',{team_count:Number(f.team_count.value),goal:f.goal.value,consent:f.consent.checked},signal);if($('roles').value===roleId){render(result,result.snapshot,result.usage,'本次配将结果');status('结果已保存至 MySQL。');}else status('结果已保存到原角色，请切回该角色查看历史。');}));
$('loadHistory').onclick=action(async()=>{const id=$('roles').value;if(!id)throw Error('请先选择角色');const history=await api(`/roles/${id}/recommendations`);if(id!==$('roles').value)return;$('planResults').replaceChildren();for(const row of history)render(row.result,row.snapshot,row.usage_data,`历史记录 · ${new Date(row.created_at).toLocaleString()}`);status(history.length?'已加载历史快照，当前资源可能已变化。':'当前角色暂无配将记录。');});
window.addEventListener('role-resources-changed',()=>{$('planResults').replaceChildren();$('planForm').elements.consent.checked=false;});
await action(async()=>fill(await api('/model/config')))();
