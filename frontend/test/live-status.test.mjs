import test from 'node:test';
import assert from 'node:assert/strict';
import {liveMintStatus} from '../dist/live-status.mjs';
const open={mintEnabled:true,paused:false,closed:false,retired:false,totalMinted:158,opened:false,block:123};

test('a previous open snapshot is not current permission after a failed refresh in either language',()=>{
 for(const language of ['zh','en']){
  const current=liveMintStatus(open,{fresh:true,language});
  const stale=liveMintStatus(open,{fresh:false,language});
  assert.equal(current.open,true);assert.equal(stale.open,false);assert.equal(stale.fresh,false);
  assert.equal(stale.block,123);assert.notEqual(stale.label,current.label);assert.notEqual(stale.message,current.message);
  assert.equal(liveMintStatus(null,{fresh:true,language}).open,false);
 }
});
test('pause, closure, retirement and exhausted supply override the enabled Mint flag',()=>{
 for(const extra of [{paused:true},{closed:true},{retired:true},{totalMinted:10000},{mintEnabled:false}]){
  const status=liveMintStatus({...open,...extra},{fresh:true});assert.equal(status.open,false);assert.equal(status.fresh,true);
 }
 assert.equal(liveMintStatus({...open,opened:true},{fresh:true}).open,true);
});
