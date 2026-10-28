import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig,publicConfig,callModel,requestInput,buildMessages,validatePlan } from '../services/api/model.mjs';
const config={base_url:'https://example.com/v1',model:'test',api_key:'fake-key',timeout_seconds:10,max_output_tokens:1024,token_parameter:'max_tokens',json_mode:true};
const resources=[1,2,3].map(i=>({id:`g${i}`,name:`武将${i}`,kind:'general',attributes:{}}));
resources.push({id:'t',kind:'tactic',name:'战法',attributes:{可用数量:'1'}});
const snapshot={role:{name:'private-name',server:'private-server',season:'S1'},resources};
const request={team_count:1,goal:'打架'};
const plan=()=>({summary:'测试建议',warnings:[],teams:[{name:'一队',reason:'测试',members:['大营','中军','前锋'].map((position,i)=>({position,general_id:`g${i+1}`,tactic_ids:[],treasure_id:null,advice:'待核实'}))}]});
test('config hides secrets and restricts insecure remote endpoint and key reuse',()=>{
  assert.equal(publicConfig(config).api_key,undefined);
  assert.throws(()=>validateConfig({...config,base_url:'http://remote.example/v1'}));
  assert.throws(()=>validateConfig({...config,base_url:'https://another.example/v1',api_key:''},config));
  assert.equal(validateConfig({...config,api_key:''},config).api_key,'fake-key');
  assert.equal(validateConfig({...config,clear_key:true},config).api_key,'');
});
test('consent and request limits checked; model prompt excludes role identity',()=>{
  assert.throws(()=>requestInput({...request,consent:false}));
  assert.throws(()=>requestInput({...request,team_count:6,consent:true}));
  const prompt=JSON.stringify(buildMessages(snapshot,request));assert.ok(!prompt.includes('private-name'));assert.ok(!prompt.includes('private-server'));
});
test('schema and resource restrictions reject unknown, duplicate and overused resources',()=>{
  assert.equal(validatePlan(JSON.stringify(plan()),snapshot,request).validation.passed,true);
  let p=plan();p.teams[0].members[0].general_id='missing';assert.equal(validatePlan(JSON.stringify(p),snapshot,request).validation.passed,false);
  p=plan();p.teams[0].members[1].general_id='g1';assert.equal(validatePlan(JSON.stringify(p),snapshot,request).validation.passed,false);
  p=plan();p.teams[0].members[0].tactic_ids=['t'];p.teams[0].members[1].tactic_ids=['t'];assert.equal(validatePlan(JSON.stringify(p),snapshot,request).validation.passed,false);
  p=plan();p.teams[0].members[0].tactic_ids=['t','t'];assert.equal(validatePlan(JSON.stringify(p),snapshot,request).validation.passed,false);
  p=plan();p.teams[0].members[0].position='前锋';assert.throws(()=>validatePlan(JSON.stringify(p),snapshot,request));
  assert.throws(()=>validatePlan('not json',snapshot,request));
});
test('provider request authorization, token parameters, json mode and sanitized usage',async()=>{
  const result=await callModel(config,[{role:'user',content:'JSON'}],{fetchImpl:async(url,options)=>{
    assert.equal(url,'https://example.com/v1/chat/completions');assert.equal(options.redirect,'error');assert.match(options.headers.Authorization,/Bearer /);
    const body=JSON.parse(options.body);assert.equal(body.max_tokens,1024);assert.equal(body.response_format.type,'json_object');
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{total_tokens:4,secret:'no'}}));
  }});assert.deepEqual(result.usage,{total_tokens:4});
});
test('provider failures do not leak remote bodies and do not retry',async()=>{
  let calls=0;await assert.rejects(()=>callModel(config,[],{fetchImpl:async()=>{calls++;return new Response('fake-secret',{status:401});}}),e=>!e.message.includes('fake-secret')&&e.message.includes('401'));assert.equal(calls,1);
  await assert.rejects(()=>callModel(config,[],{fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial'}}]}))}),/上限/);
  await assert.rejects(()=>callModel(config,[],{fetchImpl:async()=>new Response('not json')}),/无效 JSON/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>callModel(config,[],{signal:controller.signal,fetchImpl:async()=>{throw Error('private error');}}),/取消或超时/);
});
