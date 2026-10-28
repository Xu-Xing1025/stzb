import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceInput, importInput } from '../services/api/validation.mjs';
test('reject malformed import before database writes',()=>{
  assert.throws(()=>importInput({version:2,resources:[]}));
  assert.throws(()=>importInput({version:1,role:{name:'角色'},resources:[{kind:'unknown'}]}));
});
test('unknown properties stay absent and distinct treasure properties survive',()=>{
  const r=resourceInput({name:'宝物',kind:'treasure',attributes:{词条:'测试'},verified:false});
  assert.deepEqual(r.attributes,{词条:'测试'});assert.equal(r.verified,false);
  assert.throws(()=>resourceInput({...r,attributes:[]}));
});
