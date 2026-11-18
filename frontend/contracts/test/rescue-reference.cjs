// Behavioral checks of the unchanged IDENTIDE reference. Local chain 1337 only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const dependencyRoot=process.env.ECHO_RESCUE_TOOLCHAIN||path.resolve(__dirname,'..');
const dependency=createRequire(path.join(dependencyRoot,'package.json'));
const solc=dependency('solc'),ganache=dependency('ganache');
const {BrowserProvider,ContractFactory,parseEther,ZeroAddress}=dependency('ethers');
const reference=path.resolve(__dirname,'../reference/identide');
const provenance=JSON.parse(fs.readFileSync(path.join(reference,'provenance.json')));
const source=name=>fs.readFileSync(path.join(reference,name),'utf8').replaceAll('\r\n','\n');
for(const name of Object.keys(provenance.files))assert.equal(crypto.createHash('sha256').update(source(name)).digest('hex'),provenance.files[name].sha256);
assert.match(solc.version(),/^0\.8\.24\+/);
const mint=source('AgentMint.sol');
assert.equal((mint.match(/pair\.mint\(DEAD\)/g)||[]).length,2,'Initial and later project LP go to DEAD');
const hook=mint.slice(mint.indexOf('    function _beforeRescue('),mint.lastIndexOf('\n}'));
const harness=`// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {EmergencyControl} from "reference/EmergencyControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockToken is ERC20 {
    constructor() ERC20("Local mock", "MOCK") {}
    function mint(address to,uint amount) external { _mint(to,amount); }
}
contract ReferenceHarness is EmergencyControl {
    IERC20 public immutable token;
    IERC20 public immutable usdt;
    IERC20 public immutable pair;
    uint public totalRefundCredits;
    bool public closed;
    event MintClosed(bytes32 reason);
    constructor(address admin,address vault,address t,address u,address p) EmergencyControl(admin,vault) {
        token=IERC20(t);usdt=IERC20(u);pair=IERC20(p);
    }
    receive() external payable {}
    function setRefundCredits(uint value) external onlyOwner { totalRefundCredits=value; }
${hook}
}`;
const input={language:'Solidity',sources:{'reference/EmergencyControl.sol':{content:source('EmergencyControl.sol')},'test/ReferenceHarness.sol':{content:harness}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const compiled=JSON.parse(solc.compile(JSON.stringify(input),{import(name){try{if(!name.startsWith('@openzeppelin/'))throw Error('Unknown import');return {contents:fs.readFileSync(dependency.resolve(name),'utf8')};}catch(e){return {error:e.message};}}}));
const errors=(compiled.errors||[]).filter(e=>e.severity==='error');assert.equal(errors.length,0,errors.map(e=>e.formattedMessage).join('\n'));
const artifacts=compiled.contracts['test/ReferenceHarness.sol'];
let g,p;const passed=[];
async function run(){
    g=ganache.provider({logging:{quiet:true},wallet:{deterministic:true,totalAccounts:4,defaultBalance:100},chain:{chainId:1337,hardfork:'shanghai',time:new Date('2026-01-01T00:00:00Z')},miner:{timestampIncrement:0}});
    p=new BrowserProvider(g,undefined,{cacheTimeout:-1});p.pollingInterval=10;
    const owner=await p.getSigner(0),vault=await p.getSigner(1),outsider=await p.getSigner(2);
    const oa=await owner.getAddress(),va=await vault.getAddress();
    const tx=async promise=>(await promise).wait();
    async function rejected(action,label){let failed=false;try{const result=await action();if(result?.wait)await result.wait();}catch{failed=true;}assert(failed,label);passed.push(label);}
    async function deploy(name,args=[]){const a=artifacts[name],c=await new ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args,{gasLimit:7000000});await c.waitForDeployment();return c;}
    const token=await deploy('MockToken'),usdt=await deploy('MockToken'),lp=await deploy('MockToken'),other=await deploy('MockToken');
    const args=[oa,va,token.target,usdt.target,lp.target];
    const h=await deploy('ReferenceHarness',args);
    await rejected(()=>deploy('ReferenceHarness',[oa,ZeroAddress,...args.slice(2)]),'zero rescue recipient rejected');
    assert.equal(await h.RESCUE_DELAY(),172800n);assert.equal(await h.rescueVault(),va);passed.push('two-day delay and fixed rescue recipient');
    await rejected(()=>h.connect(outsider).setPaused(true),'non-owner pause rejected');
    await rejected(()=>h.queueRescue(other.target,1),'queue requires pause');
    await tx(h.setPaused(true));
    await rejected(()=>h.connect(outsider).queueRescue(other.target,1),'non-owner queue rejected');
    await rejected(()=>h.queueRescue(other.target,0),'zero rescue amount rejected');
    await tx(other.mint(h.target,100));await tx(h.queueRescue(other.target,20));
    await rejected(()=>h.queueRescue(other.target,1),'only one pending rescue permitted');
    await rejected(()=>h.setPaused(false),'unpause blocked while rescue pending');
    await rejected(()=>h.connect(outsider).cancelRescue(),'non-owner cancellation rejected');
    await rejected(()=>h.executeRescue(),'execution blocked before deadline');
    await g.request({method:'evm_increaseTime',params:[172799]});await g.request({method:'evm_mine',params:[]});
    await rejected(()=>h.executeRescue(),'execution blocked one second before deadline');
    await g.request({method:'evm_increaseTime',params:[1]});await g.request({method:'evm_mine',params:[]});
    assert.equal(await other.balanceOf(va),0n);passed.push('deadline does not automatically execute rescue');
    await rejected(()=>h.connect(outsider).executeRescue(),'non-owner execution rejected after deadline');
    await tx(h.executeRescue());assert.equal(await other.balanceOf(va),20n);assert.equal((await h.rescue()).eta,0n);assert.equal(await h.retired(),false);passed.push('owner execution transfers exact amount to fixed recipient and clears queue');
    await rejected(()=>h.executeRescue(),'completed rescue cannot be replayed');
    await tx(h.queueRescue(other.target,1));await tx(h.cancelRescue());assert.equal((await h.rescue()).eta,0n);await tx(h.setPaused(false));passed.push('owner cancellation clears pending rescue and permits resume');
    await tx(h.setPaused(true));await tx(lp.mint(h.target,10));await tx(h.queueRescue(lp.target,1));
    await g.request({method:'evm_increaseTime',params:[172800]});await g.request({method:'evm_mine',params:[]});
    await rejected(()=>h.executeRescue(),'LP token rescue rejected even after deadline');assert.notEqual((await h.rescue()).eta,0n);await tx(h.cancelRescue());
    await tx(owner.sendTransaction({to:h.target,value:parseEther('1')}));await tx(h.setRefundCredits(parseEther('0.4')));await tx(h.queueRescue(ZeroAddress,parseEther('0.7')));
    await g.request({method:'evm_increaseTime',params:[172800]});await g.request({method:'evm_mine',params:[]});
    await rejected(()=>h.executeRescue(),'native rescue cannot spend reserved refund credits');await tx(h.cancelRescue());
    const before=BigInt(await g.request({method:'eth_getBalance',params:[va,'latest']}));
    await tx(h.queueRescue(ZeroAddress,parseEther('0.6')));await g.request({method:'evm_increaseTime',params:[172800]});await g.request({method:'evm_mine',params:[]});await tx(h.executeRescue());
    assert.equal(BigInt(await g.request({method:'eth_getBalance',params:[va,'latest']}))-before,parseEther('0.6'));assert.equal(await h.retired(),false);passed.push('original native rescue preserves credits and does not retire mint');
    for(const asset of [usdt,token]){
        const core=await deploy('ReferenceHarness',args);await tx(core.setPaused(true));await tx(asset.mint(core.target,10));await tx(core.queueRescue(asset.target,5));
        await g.request({method:'evm_increaseTime',params:[172800]});await g.request({method:'evm_mine',params:[]});await tx(core.executeRescue());
        assert.equal(await core.retired(),true);assert.equal(await core.closed(),true);await rejected(()=>core.setPaused(false),'settlement/project-token rescue permanently prevents resume');
    }
    await rejected(()=>h.renounceOwnership(),'ownership renouncement disabled');
    await tx(h.transferOwnership(await outsider.getAddress()));assert.equal(await h.owner(),oa);await tx(h.connect(outsider).acceptOwnership());assert.equal(await h.owner(),await outsider.getAddress());assert.equal(await h.rescueVault(),va);passed.push('two-step admin transfer preserves immutable rescue recipient');
    const report={chainId:1337,compiler:solc.version(),referenceMint:provenance.mintContract,moduleSha256:provenance.files['EmergencyControl.sol'].sha256,passed,scope:'Local EVM reference tests only. The original mint hook is extracted unchanged. ECHO mint integration and deployment remain pending. No network RPC or real wallet was used.'};
    fs.writeFileSync(path.resolve(__dirname,'../reference-test-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:passed.length,chainId:1337,moduleUnchanged:true,scope:report.scope}));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{p?.destroy();if(g)await g.disconnect();});
