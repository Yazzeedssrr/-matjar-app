/* Navigation-only integration; does not write to existing store records or edit forms. */
(() => {
'use strict';
const text={ar:['مركز تشغيل العسل','معلومات المتجر وسياساته','بيانات العبوة'],en:['Honey operations','Store information & policies','Package details'],es:['Operaciones de miel','Información y políticas','Datos del envase'],fr:['Gestion du miel','Informations et politiques','Détails de l’emballage'],tr:['Bal operasyonları','Mağaza bilgileri ve politikalar','Ambalaj bilgileri']};
function language(){let l='ar';try{l=localStorage.getItem('makhraj-language')||'ar'}catch{}return text[l]||text.ar}
function link(href,key){const a=document.createElement('a');a.href=href;a.dataset.opsLink=String(key);a.dataset.noI18n='';a.className='ghost';a.textContent=language()[key];a.style.cssText='display:inline-flex;align-items:center;min-height:44px;padding:10px 12px;border:1px solid #715a32;border-radius:12px;color:inherit;text-decoration:none;gap:8px';return a}
const admin=document.querySelector('.admin-top-actions');if(admin&&!admin.querySelector('[data-ops-link]'))admin.append(link('operations.html',0));
const footer=document.querySelector('.honey-footer');if(footer&&!footer.querySelector('[data-ops-link]'))footer.prepend(link('information.html',1));
const grid=document.getElementById('productGrid');
function productLinks(){if(!grid)return;grid.querySelectorAll('[data-product]').forEach(card=>{if(card.querySelector('[data-ops-link]'))return;const id=card.dataset.product;if(!/^[0-9a-f-]{36}$/i.test(id||''))return;const a=link('information.html?product='+encodeURIComponent(id),2);a.style.marginTop='10px';(card.querySelector('.pbody')||card).append(a)})}
if(grid){productLinks();new MutationObserver(productLinks).observe(grid,{childList:true})}
document.addEventListener('makhraj:languagechange',()=>document.querySelectorAll('[data-ops-link]').forEach(a=>{a.textContent=language()[Number(a.dataset.opsLink)]}));
})();
