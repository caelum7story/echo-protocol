import './experience.mjs?v=20261118-design-v73';
import {getLanguage} from './i18n.mjs';
document.body.classList.add('echo-concept');
const progress=document.querySelector('.compact-mint-progress'),intro=document.querySelector('.mint-intro');
intro.after(progress);
const action=document.getElementById('concept-mint-start')||document.createElement('button');action.type='button';action.id='concept-mint-start';action.className='concept-start';intro.firstElementChild.append(action);
action.onclick=()=>{document.querySelector('.quantity-control').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});document.getElementById('quantity').focus({preventScroll:true});};
const t=(zh,en)=>getLanguage()==='en'?en:zh;
function render(){
 document.getElementById('hero-title').innerHTML='<span class="tech-word">ECHO</span><span class="tech-headline">'+t('让想法，留下回响。','Ideas deserve an echo.')+'</span>';
 document.getElementById('experience-intro').textContent=t('从创世铸造，到属于 Agent 的发行平台。','From Genesis Mint to a launchpad for Agents.');
 document.getElementById('mint-title').textContent=t('铸造 ECHO，\n留下回响。','Mint ECHO.\nMake a signal.');
 document.querySelector('.mint-intro .section-description').textContent=t('你的 Agent，核验每一步。','Your Agent verifies every step.');
 action.textContent=t('选择我的份数','Choose my shares');
 document.getElementById('step-wallet-label').textContent=t('核验身份','Verify ID');document.getElementById('step-amount-label').textContent=t('选择份数','Shares');document.getElementById('step-review-label').textContent=t('确认铸造','Review');
 document.getElementById('compact-progress-title').textContent=t('创世铸造进度','Genesis Mint progress');if(progress.dataset.verified==='true')document.getElementById('compact-progress-note').textContent=t('免费 + 付费','Free + paid');
}
document.addEventListener('echo:language',render);document.addEventListener('echo:mint-progress',()=>{document.getElementById('compact-progress-title').textContent=t('创世铸造进度','Genesis Mint progress');});render();
