import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTENT_MODULES,PRIMARY_CONTENT_NAV,cleanContentAnchor,contentModuleForAnchor} from '../public/content-modules.mjs';

test('all published Mint, invite, transaction and team links retain the correct module',()=>{
 for(const [anchor,key] of [['','home'],['#top','home'],['#mint','mint'],['#my-participation','mint'],['#launch-overview','mint'],['#activity','mint'],['#invite','invite'],['#growth-campaign','invite'],['#teams','invite'],['#team-preview','invite'],['#mechanism','mint']])assert.equal(contentModuleForAnchor(anchor),key);
 assert.equal(new Set(CONTENT_MODULES.map(m=>m.anchor)).size,3);
});
test('malformed and prototype-property hash values cannot select an unintended module',()=>{
 for(const value of ['#constructor','#toString','#__proto__','#unknown'])assert.equal(contentModuleForAnchor(value),null);
 for(const value of ['#%E0%A4%A','#<script>','#mint?token=secret','#https://evil.example'])assert.equal(cleanContentAnchor(value),null);
 assert.equal(cleanContentAnchor('#growth%2Dcampaign'),'growth-campaign');
});

test('primary navigation uses the requested order and Launch is a separate site path',()=>{assert.deepEqual(PRIMARY_CONTENT_NAV.map(x=>x.key),['home','mint','launch','invite']);assert.equal(PRIMARY_CONTENT_NAV[2].href,'/launch/');assert.equal(contentModuleForAnchor('#rules'),'mint');});
