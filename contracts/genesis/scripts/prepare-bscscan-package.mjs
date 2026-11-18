import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Interface, AbiCoder, JsonRpcProvider, keccak256} from 'ethers';
import {assertBuild} from './build-integrity.mjs';

const report = assertBuild();
const deployment = JSON.parse(fs.readFileSync('deployment/verified-deployment.json', 'utf8'));
const request = JSON.parse(fs.readFileSync('deployment/deployment-request.json', 'utf8'));
const reference = JSON.parse(fs.readFileSync('config/bsc-reference.json', 'utf8'));
const output = path.resolve('../echo-bscscan-verification-20261111');
fs.mkdirSync(output, {recursive:true});
const inputBytes = fs.readFileSync('artifacts/standard-input.json');
const input = JSON.parse(inputBytes);
if (report.sourceSha256 !== '10a222b30e7970297cf6d4d75e64bef52c3ed04f38a0156d801c99fd7b6013a4') throw Error('Unexpected deployed release');
fs.writeFileSync(path.join(output, 'standard-input.json'), inputBytes);
const provider = new JsonRpcProvider(process.env.ECHO_RPC_URL || 'https://bsc-dataseed.bnbchain.org', 56, {staticNetwork:true});
try {
 const transaction = await provider.getTransaction(deployment.hash);
 const receipt = await provider.getTransactionReceipt(deployment.hash);
 if (!transaction || transaction.data !== request.request.data || receipt?.status !== 1 || receipt.contractAddress?.toLowerCase() !== deployment.launch.toLowerCase()) throw Error('Deployment transaction mismatch');
 const expectedArgs = {
  EchoLaunch:[request.config],
  EchoToken:[deployment.launch,request.config.rewards,reference.factory],
  EchoOracle:[deployment.pair,deployment.token,deployment.launch]
 };
 const contracts = [];
 for (const [name, key] of [['EchoLaunch','launch'],['EchoToken','token'],['EchoOracle','oracle']]) {
  const artifact = JSON.parse(fs.readFileSync(`artifacts/${name}.json`, 'utf8'));
  const args = fs.readFileSync(`deployment/${name}-constructor-arguments.txt`, 'utf8').trim();
  const iface = new Interface(artifact.abi);
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(args) || iface.encodeDeploy(expectedArgs[name]).slice(2).toLowerCase() !== args.toLowerCase()) throw Error(`${name} constructor arguments mismatch`);
  const decoded = AbiCoder.defaultAbiCoder().decode(iface.deploy.inputs, '0x'+args);
  if (iface.encodeDeploy(decoded).slice(2).toLowerCase() !== args.toLowerCase()) throw Error(`${name} constructor is not canonical ABI encoding`);
  if (name === 'EchoLaunch' && artifact.bytecode + args !== transaction.data) throw Error('Creation bytecode mismatch');
  if (keccak256(await provider.getCode(deployment[key])) !== deployment.codeHashes[key]) throw Error(`${name} runtime changed`);
  const sourcify = JSON.parse(fs.readFileSync(`deployment/sourcify-${name}.json`, 'utf8'));
  if (sourcify.contract?.creationMatch !== 'exact_match' || sourcify.contract?.runtimeMatch !== 'exact_match' || sourcify.contract.address.toLowerCase() !== deployment[key].toLowerCase()) throw Error(`${name} exact-match evidence missing`);
  const compilerVersion = 'v0.8.24+commit.e11b9ed9';
  const params = new URLSearchParams({a:deployment[key],c:compilerVersion,lictype:'3'});
  const record = {name,address:deployment[key],contractIdentifier:`contracts/${name}.sol:${name}`,compilerVersion,constructorArgumentsFile:`${name}-constructor-arguments.txt`,constructorArgumentsHexLength:args.length,codeHash:deployment.codeHashes[key],sourcify:'exact_match',bscscan:'unconfirmed',verificationUrl:`https://bscscan.com/verifyContract-solc-json?${params}`,codeUrl:`https://bscscan.com/address/${deployment[key]}#code`};
  fs.writeFileSync(path.join(output, record.constructorArgumentsFile), args+'\n');
  fs.writeFileSync(path.join(output, `${name}-sourcify-evidence.json`), JSON.stringify(sourcify,null,2)+'\n');
  contracts.push(record);
 }
 const manifest = {project:'ECHO',chainId:56,preparedAt:new Date().toISOString(),deploymentTransaction:deployment.hash,sourceFile:'standard-input.json',sourceFileSha256:createHash('sha256').update(inputBytes).digest('hex'),semanticSourceSha256:report.sourceSha256,compilerVersion:'v0.8.24+commit.e11b9ed9',settings:input.settings,licenseType:3,license:'MIT',broadcast:false,contracts};
 fs.writeFileSync(path.join(output,'verification-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({ok:true,output,compilerVersion:manifest.compilerVersion,creationTransactionExactMatch:true,runtimeHashesVerified:true,constructorsVerified:contracts.map(c=>({name:c.name,address:c.address,hexLength:c.constructorArgumentsHexLength})),bscscan:'not-yet-confirmed'}));
} finally {provider.destroy();}
