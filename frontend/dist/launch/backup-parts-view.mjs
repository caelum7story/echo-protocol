import {byteLabel} from './file-budget.mjs';
export function backupPartsDialog(state,h){
 const {t,esc,btn,note}=h,p=state.pack;
 const fallback=`<div class="actions">${btn('backup-raw',t('下载完整原始备份','Download complete raw backup'),'secondary')}${btn('backup-pack-cancel',t('关闭','Close'),'text-link')}</div>`;
 if(state.error)return note(esc(state.error),'warning')+`<p>${t('原数据未改动。可先保存完整原始备份，再按项目分别导出。','Original data is unchanged. Preserve the raw backup, then export individual plans.')}</p>`+fallback;
 if(!p)return `<p id="backup-pack-progress" role="status">${t('正在生成备份分包，请稍候。','Preparing backup parts. Please wait.')}</p>${btn('backup-pack-cancel',t('取消生成','Cancel preparation'),'secondary')}`;
 return `<p>${t('请逐个下载全部分包，并保留在同一文件夹。恢复时一次选择同一组的全部文件，顺序不限。','Download every part and keep them in one folder. Select all files from the same group when restoring; order does not matter.')}</p><dl class="facts"><div><dt>${t('原始数据大小','Original data size')}</dt><dd>${byteLabel(p.payloadBytes)}</dd></div><div><dt>${t('备份组','Backup group')}</dt><dd class="mono">${esc(p.payloadDigest.slice(0,16))}</dd></div><div><dt>${t('分包数量','Parts')}</dt><dd>${p.total}</dd></div></dl><p id="pack-download-status" class="muted" role="status">${t('已发起','Requested')} ${state.requested.size} / ${p.total} ${t('包下载；请检查文件已保存。','downloads; check the files are saved.')}</p><div class="backup-part-list">${p.parts.map(part=>`<div><div><strong>${t('第','Part')} ${part.index} / ${p.total}</strong><small>${byteLabel(part.bytes)}</small></div>${btn('backup-part-download',t('下载此分包','Download this part'),'secondary',`data-index="${part.index}"`)}</div>`).join('')}</div>${note(t('校验只检查文件完整性，不验证作者、身份或链上资产。重新生成会创建新组，请勿混用文件。','Checks verify file integrity, not authorship, identity or on-chain assets. A newly generated group must not be mixed with this one.'))}${fallback}`;
}
export function recoveryTransportNote(transport,h){
 if(transport?.kind!=='parts')return '';
 const {t,esc,note}=h;
 return note(`${t('分包完整性检查通过','Backup-part integrity checked')} · ${transport.parts} ${t('包','parts')} · ${byteLabel(transport.payloadBytes)}${transport.duplicates?`<br>${t('已跳过相同的重复文件','Identical duplicate files skipped')}: ${transport.duplicates}`:''}<br><span class="mono">${esc(transport.payloadDigest.slice(0,16))}</span><p>${t('仅说明文件已完整重组；不代表项目来源、合约或链上状态已验证。','The files were reassembled completely. Project origin, contracts and chain state remain unverified.')}</p>`);
}
