import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {CarReader,CarWriter} from '@ipld/car';
import {keccak256} from 'ethers';
import {verifyNftCar,checkNftRetrieval} from '../lib/nft-content.mjs';
import {root} from './compile.mjs';

const run=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputHashes=Object.fromEntries(await Promise.all(['scripts/test-kubo-offline.mjs','lib/nft-content.mjs','references/kubo-release.json','evidence/kubo-tool-verification.json','package-lock.json'].map(async file=>[file,sha(await fs.readFile(path.join(root,file)))])));
const tool=JSON.parse(await fs.readFile(path.join(root,'evidence/kubo-tool-verification.json'),'utf8')),executable=path.resolve(root,tool.executable);
if(!executable.startsWith(path.join(root,'tools')+path.sep)||sha(await fs.readFile(executable))!==tool.executableSha256||!tool.archiveChecksumsVerified||!tool.officialReleaseMetadataMatched)throw Error('Verified isolated official tool required');
const example=path.resolve(root,'../../work/echo-launch-preview-20261113/nft-content-20261114'),reference=JSON.parse(await fs.readFile(path.join(example,'reference.json'),'utf8')),
 manifest=JSON.parse(await fs.readFile(path.join(example,'manifest.json'),'utf8')),car=await fs.readFile(path.join(example,'collection.car'));
const expected={rootCid:reference.rootCid,metadataRoot:reference.metadataRoot,supply:reference.supply};
await verifyNftCar(car,expected);if(sha(car)!==reference.carSha256)throw Error('Prepared CAR changed');
const parent=path.resolve(root,'../../work/echo-launch-preview-20261113/ipfs-offline-20261114');await fs.mkdir(parent,{recursive:true});
const working=await fs.mkdtemp(path.join(parent,'run-')),nodes=[],checks=[],commands=[];
const liveFile=path.join(root,'evidence/kubo-offline-live.json'),resultFile=path.join(root,'evidence/kubo-offline-result.json');
async function live(status){await fs.writeFile(liveFile,JSON.stringify({at:new Date().toISOString(),status,runDirectory:working,ownedDaemons:nodes.filter(n=>n.child&&n.child.exitCode===null).map(n=>({pid:n.child.pid,repo:n.repo,offline:true})),publicPublication:false},null,2)+'\n');}
const verify=(condition,message)=>{if(!condition)throw Error(message);checks.push(message);};
function environment(repo){return {...process.env,IPFS_PATH:repo,IPFS_FD_MAX:'2048'};}
async function command(repo,args,{binary=false,allowFailure=false}={}){
 try{const r=await run(executable,['--offline',...args],{cwd:root,env:environment(repo),windowsHide:true,timeout:25000,maxBuffer:64*1024*1024,encoding:binary?'buffer':'utf8'});commands.push({repo:path.basename(repo),args,exitCode:0});return {code:0,stdout:r.stdout,stderr:r.stderr};}
 catch(error){commands.push({repo:path.basename(repo),args,exitCode:typeof error.code==='number'?error.code:null});if(!allowFailure)throw Error('KUBO_COMMAND_FAILED:'+args.slice(0,2).join('/'));return {code:typeof error.code==='number'?error.code:-1,stdout:error.stdout??'',stderr:error.stderr??''};}
}
async function port(){const s=net.createServer();await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
async function initNode(name){
 const repo=path.join(working,name);if(!repo.startsWith(working+path.sep))throw Error('Unsafe test repo');await fs.mkdir(repo);
 await command(repo,['init','--empty-repo=true']);
 const configFile=path.join(repo,'config'),config=JSON.parse(await fs.readFile(configFile,'utf8')),apiPort=await port(),gatewayPort=await port();
 config.Addresses.API=`/ip4/127.0.0.1/tcp/${apiPort}`;config.Addresses.Gateway=`/ip4/127.0.0.1/tcp/${gatewayPort}`;config.Addresses.Swarm=[];
 config.Bootstrap=[];config.Discovery.MDNS.Enabled=false;config.Swarm.DisableNatPortMap=true;config.Gateway.NoFetch=true;
 // Generated peer keys stay only in this excluded local repo. Never print/config-export them.
 await fs.writeFile(configFile,JSON.stringify(config,null,2)+'\n');
 const node={name,repo,apiPort,gatewayPort,child:null,logs:'',offline:true};nodes.push(node);return node;
}
async function importAndCheck(node){
 await command(node.repo,['dag','import','--pin-roots=true','--fast-provide-root=false','--fast-provide-dag=false',path.join(example,'collection.car')]);
 const pins=await command(node.repo,['pin','ls','--type=recursive',reference.rootCid]);verify(pins.stdout.includes(reference.rootCid)&&pins.stdout.includes('recursive'),node.name+':root recursively pinned');
 const broken=await command(node.repo,['pin','verify','--quiet']);verify(broken.stdout.trim()==='',node.name+':no broken recursive pins');
 await command(node.repo,['repo','gc','--quiet']);
 const exported=await command(node.repo,['dag','export',reference.rootCid],{binary:true});await verifyNftCar(exported.stdout,expected);
 await fs.writeFile(path.join(working,node.name+'-export.car'),exported.stdout,{flag:'wx'});verify(true,node.name+':all metadata/images survive local GC and native CAR export');
 for(const entry of manifest.entries){
  const metadata=await command(node.repo,['cat',`/ipfs/${reference.rootCid}/${entry.metadataPath}`],{binary:true}),image=await command(node.repo,['cat',`/ipfs/${reference.rootCid}/${entry.imagePath}`],{binary:true});
  verify(keccak256(metadata.stdout)===entry.metadataHash&&keccak256(image.stdout)===entry.imageHash,node.name+':exact content bytes for NFT'+entry.tokenId);
 }
}
async function start(node){
 const child=spawn(executable,['--offline','daemon','--migrate=false'],{cwd:root,env:environment(node.repo),windowsHide:true,stdio:['ignore','pipe','pipe']});node.child=child;
 const ready=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('KUBO_OFFLINE_START_TIMEOUT')),15000);
  const data=chunk=>{node.logs+=chunk.toString();if(node.logs.includes('Daemon is ready')){clearTimeout(timeout);resolve();}};
  child.stdout.on('data',data);child.stderr.on('data',data);child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',code=>{clearTimeout(timeout);if(!node.logs.includes('Daemon is ready'))reject(Error('KUBO_OFFLINE_EXIT:'+code));});
 });await live('starting-offline-node');await ready;await live('offline-nodes-running');
 const response=await fetch(`http://127.0.0.1:${node.apiPort}/api/v0/version`,{method:'POST',signal:AbortSignal.timeout(5000)});
 verify(response.ok&&(await response.json()).Version===tool.version,node.name+':actual loopback API version');
}
async function stop(node){
 const child=node.child;if(!child||child.exitCode!==null)return;
 const exited=new Promise(resolve=>child.once('exit',resolve));await command(node.repo,['shutdown'],{allowFailure:true});
 const completed=await Promise.race([exited.then(()=>true),new Promise(resolve=>{const t=setTimeout(()=>resolve(false),5000);t.unref();})]);
 if(!completed){child.kill();await exited;}
 node.child=null;
}
async function networkScope(node){
 const pid=node.child.pid;if(!Number.isSafeInteger(pid)||pid<1)throw Error('Owned PID required');
 const script=`$ErrorActionPreference='Stop'; $tcp=@(Get-NetTCPConnection|Where-Object OwningProcess -eq ${pid}|Select-Object LocalAddress,RemoteAddress,State); $udp=@(Get-NetUDPEndpoint|Where-Object OwningProcess -eq ${pid}|Select-Object LocalAddress); [pscustomobject]@{TCP=$tcp;UDP=$udp}|ConvertTo-Json -Depth 4 -Compress`;
 const data=JSON.parse((await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:15000,maxBuffer:1024*1024})).stdout);
 const loopback=a=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(String(a));
 verify(data.TCP.length>0&&data.TCP.every(c=>loopback(c.LocalAddress)&&(Number(c.State)===2||String(c.State)==='Listen'||loopback(c.RemoteAddress)))&&data.UDP.length===0,node.name+':only loopback TCP,no UDP/public network listeners');return data;
}
async function partialImport(){
 const node=await initNode('missing-image'),reader=await CarReader.fromBytes(car),{writer,out}=CarWriter.create(await reader.getRoots()),chunks=[];
 const read=(async()=>{for await(const bytes of out)chunks.push(Buffer.from(bytes));})();
 const write=(async()=>{for await(const block of reader.blocks())if(block.cid.toString()!==manifest.entries[0].imageCid)await writer.put(block);await writer.close();})();await Promise.all([read,write]);
 const partial=Buffer.concat(chunks),file=path.join(working,'missing-image.car');await fs.writeFile(file,partial,{flag:'wx'});
 const imported=await command(node.repo,['dag','import','--pin-roots=true','--fast-provide-root=false','--fast-provide-dag=false',file],{allowFailure:true});
 const pins=await command(node.repo,['pin','ls','--type=recursive',reference.rootCid],{allowFailure:true});verify(pins.code!==0,'incomplete image DAG cannot become a recursive root pin');
 let rejected=false;try{await verifyNftCar(partial,expected);}catch{rejected=true;}verify(rejected,'complete verifier rejects the same native partial import');return {importExitCode:imported.code,recursivePinRejected:true};
}
let result;
try{
 await live('initializing');const a=await initNode('replica-a'),b=await initNode('replica-b');
 await importAndCheck(a);await importAndCheck(b);await start(a);await start(b);
 const network=[await networkScope(a),await networkScope(b)],origins=[a,b].map(n=>`http://127.0.0.1:${n.gatewayPort}`);
 const retrieval=await checkNftRetrieval(expected,{gateways:origins,mode:'local-test'});verify(retrieval.localRetrievalVerified,'both actual Kubo gateways return the complete committed DAG');
 await stop(a);a.logs='';await start(a);const afterRestart=await checkNftRetrieval(expected,{gateways:origins,mode:'local-test'});verify(afterRestart.localRetrievalVerified,'content remains retrievable after a real daemon restart');
 const partial=await partialImport();
 result={at:new Date().toISOString(),exitCode:0,checksPassed:checks.length,checks,version:tool.version,toolSha256:tool.executableSha256,rootCid:reference.rootCid,metadataRoot:reference.metadataRoot,
  originalCarSha256:reference.carSha256,retrieval,afterRestart,partial,network,runDirectory:working,localRecursivePinningVerified:true,publicPinning:false,publicationVerified:false,uploaded:false,walletOperations:false,
  limitations:'Two isolated local repos with generated test peer identities,offline daemon and loopback-only listeners. Proves Kubo interoperability,local GC/restart persistence and completeness rejection,not public availability,independent operators,long-term retention or an audit.'};
}catch(error){result={at:new Date().toISOString(),exitCode:1,checksPassed:checks.length,checks,error:error.message,runDirectory:working,publicPinning:false,uploaded:false};process.exitCode=1;}
finally{for(const node of nodes)await stop(node);await live('terminal-daemons-stopped');}
result.allOwnedDaemonsStopped=nodes.every(n=>!n.child||n.child.exitCode!==null);
result.inputHashes=inputHashes;
await fs.writeFile(resultFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({exitCode:result.exitCode,checksPassed:result.checksPassed,version:tool.version,error:result.error??null,allOwnedDaemonsStopped:result.allOwnedDaemonsStopped,publicPinning:false,evidence:resultFile},null,2));
