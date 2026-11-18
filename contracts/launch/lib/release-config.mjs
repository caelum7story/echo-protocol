import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {getAddress} from 'ethers';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Error(code);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function file(root,relative){
 if(typeof relative!=='string'||relative.includes('\\')||relative.includes(':')||relative.split('/').some(p=>!p||p==='.'||p==='..'))fail('RELEASE_UNSAFE_PATH');
 let target=root;for(const part of relative.split('/')){target=path.join(target,part);if(fs.lstatSync(target).isSymbolicLink())fail('RELEASE_SYMLINK');}
 if(!fs.statSync(target).isFile())fail('RELEASE_NOT_FILE');return target;
}
const read=(root,relative)=>JSON.parse(fs.readFileSync(file(root,relative),'utf8'));
export function inspectReleaseConfiguration(root){
 root=fs.realpathSync(root);
 const m=read(root,'release/confirmed-config-manifest.json');
 if(m.schema!=='echo-launch-confirmed-config-manifest/v1'||m.financialAuthorization!==false||m.productionReady!==false)fail('RELEASE_MANIFEST_SCOPE');
 for(const [relative,expected]of Object.entries(m.files??{})){
  if(!/^[0-9a-f]{64}$/.test(expected)||digest(fs.readFileSync(file(root,relative)))!==expected)fail('RELEASE_INPUT_CHANGED');
 }
 const required=['rules/deployment-decisions-20261115.json','release/deployment-spec.confirmed.json','release/runtime-policy.confirmed.json','runtime-config.json','src/LaunchRegistry.sol','src/LaunchEscrow.sol','src/LaunchToken.sol','src/NftLaunch.sol','src/TokenLaunch.sol','src/NftLaunchFactory.sol','src/TokenLaunchFactory.sol','src/DexInterfaces.sol','lib/release-config.mjs','lib/release-preflight.mjs','scripts/check-release-config.mjs','scripts/prepare-deployment.mjs','package-lock.json'];
 if(required.some(f=>!Object.hasOwn(m.files??{},f)))fail('RELEASE_PIN_MISSING');
 const d=read(root,'rules/deployment-decisions-20261115.json'),s=read(root,'release/deployment-spec.confirmed.json'),p=read(root,'release/runtime-policy.confirmed.json'),r=read(root,'runtime-config.json');
 if(d.schema!=='echo-launch-deployment-decisions/v1'||d.confirmedByUser!==true||d.userAnswer!=='以上全部确认')fail('RELEASE_DECISION_REQUIRED');
 if(d.chainId!==56||s.chainId!==56||p.chainId!==56||r.chainId!==56)fail('RELEASE_CHAIN');
 for(const role of ['platformAdmin','platformRecipient','gasWallet']){
  let value;try{value=getAddress(d.roles[role]);}catch{fail('RELEASE_ADDRESS');}if(/^0x0{40}$/i.test(value))fail('RELEASE_ADDRESS');
 }
 if(!same(s.environment.platformAdmin,d.roles.platformAdmin))fail('RELEASE_ADMIN_CHANGED');
 if(!same(s.environment.platformRecipient,d.roles.platformRecipient))fail('RELEASE_RECIPIENT_CHANGED');
 if(!same(d.roles.gasWallet,d.roles.platformAdmin))fail('RELEASE_GAS_WALLET_CHANGED');
 if(s.environment.oracleWindow!==d.oracle.windowSeconds||s.environment.oracleMaxAge!==d.oracle.maxAgeSeconds)fail('RELEASE_ORACLE_CHANGED');
 if(s.proposalOnly!==false||s.requiresExactConfigurationApproval!==false||s.configurationConfirmed!==true)fail('RELEASE_CONFIGURATION_UNCONFIRMED');
 if(d.oracle.windowSeconds!==1800||d.oracle.maxAgeSeconds!==7200||d.oracle.maxSwapReserveBps!==100||d.oracle.maxShortfallBps!==300)fail('RELEASE_ORACLE_POLICY');
 if(d.readPolicy.minConfirmations!==12||d.readPolicy.maxBlockAgeSeconds!==120)fail('RELEASE_READ_POLICY');
 for(const policy of [p,r]){
  if(policy.mode!=='production'||policy.minConfirmations!==d.readPolicy.minConfirmations||policy.maxBlockAgeSeconds!==d.readPolicy.maxBlockAgeSeconds)fail('RELEASE_READ_POLICY');
  if(policy.executionReady!==false||policy.registry?.address!==null||policy.registry?.runtimeHash!==null||!Array.isArray(policy.approvedTemplates)||policy.approvedTemplates.length!==0)fail('RELEASE_LIVE_BINDINGS_NOT_READY');
 }
 if(d.executionScope.paidTransactions!==false||d.executionScope.launchUpload!==false||d.executionScope.automaticSigner!==false)fail('RELEASE_EXECUTION_NOT_AUTHORIZED');
 if(s.configurationDecisionRecord!=='rules/deployment-decisions-20261115.json'||s.configurationDecisionSha256!==digest(fs.readFileSync(file(root,s.configurationDecisionRecord))))fail('RELEASE_DECISION_REFERENCE');
 return {schema:'echo-launch-release-config-check/v1',configurationConfirmed:true,chainId:56,roles:d.roles,oracle:d.oracle,readPolicy:d.readPolicy,filesVerified:Object.keys(m.files).length,manifestSha256:digest(fs.readFileSync(file(root,'release/confirmed-config-manifest.json'))),readOnly:true,financialAuthorization:false,executionReady:false,productionReady:false,limitations:'Local transcript-derived decision and hashes detect inconsistencies;not cryptographic user authentication,independent security review,funding or authority to sign/deploy. Existing projects and ECHO Mint are unchanged.'};
}
