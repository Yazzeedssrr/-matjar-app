(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const cfg=window.MAKHRAJ_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[ًٌٍَُِّْـ]/g,'').trim();
const intentGroups={
 gift:['هدية','هديه','gift','زوجتي','زوجي','عيد','مناسبة','مناسبه','تخرج','birthday'],
 car:['سيارة','سياره','car','سيارتي','قيادة','قياده','طريق'],
 work:['عمل','شغل','دوام','work','مكتب','توصيل'],
 travel:['سفر','رحلة','رحله','travel','طائرة','طائره'],
 urgent:['اليوم','الليلة','الليله','الآن','الان','سريع','عاجل'],
 budget:['رخيص','اقتصادي','ميزانية','ميزانيه','cheap'],
 premium:['فاخر','فخم','مميز','premium']
};
const sessionKey=(()=>{let k=localStorage.getItem('makhraj-learning-session');if(!k){k=(crypto.randomUUID?.()||('s-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem('makhraj-learning-session',k)}return k})();
let currentTerms=[];
function tokens(q){const n=norm(q);const out=new Set(n.split(/\s+/).filter(x=>x.length>1).slice(0,14));Object.entries(intentGroups).forEach(([k,arr])=>{if(arr.some(x=>n.includes(norm(x))))out.add(k)});return [...out].slice(0,18)}
function productText(p){return norm([p.name,p.description,p.brand,(p.tags||[]).join(' '),(p.need_tags||[]).join(' '),(p.situations||[]).join(' '),p.benefit_summary,p.ideal_for,Object.entries(p.specifications||{}).flat().join(' ')].join(' '))}
async function learn(type,{productId=null,bundleId=null,terms=currentTerms,context={}}={}){try{await sb.rpc('record_learning_event',{p_session_key:sessionKey,p_event_type:type,p_need_terms:terms||[],p_product_id:productId,p_bundle_id:bundleId,p_context:context,p_event_value:null})}catch(e){console.debug('learning event skipped',e?.message)}}
function baseScore(p,ts){const text=productText(p);let s=0,reasons=[];ts.forEach(t=>{if(text.includes(t)){s+=3;reasons.push(t)};(p.need_tags||[]).forEach(x=>{if(norm(x).includes(t)||t.includes(norm(x))){s+=5;reasons.push(x)}});(p.situations||[]).forEach(x=>{if(norm(x).includes(t)||t.includes(norm(x))){s+=4;reasons.push(x)}})});if(p.featured)s+=1;const stock=(p.product_variants||[]).reduce((a,v)=>a+Number(v.stock_quantity||0),0);if(stock>0)s+=1;else s-=50;return {score:s,reasons:[...new Set(reasons)].slice(0,3)}}
async function fetchData(ts){const [{data:products,error:pErr},{data:learned,error:lErr}]=await Promise.all([
 sb.from('products').select('id,name,description,brand,tags,need_tags,situations,benefit_summary,ideal_for,base_price,featured,specifications,product_images(url,sort_order),product_variants(id,price,stock_quantity)').eq('status','active'),
 ts.length?sb.from('learned_product_terms').select('term,product_id,score,interactions,conversions').in('term',ts):Promise.resolve({data:[],error:null})
]);if(pErr)throw pErr;if(lErr)console.debug(lErr);const learnedMap={};(learned||[]).forEach(x=>{learnedMap[x.product_id]=(learnedMap[x.product_id]||0)+Number(x.score||0)});return{products:products||[],learnedMap}}
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:(cfg?.currency||'USD')}).format(Number(n||0));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function solve(q){q=q.trim();if(!q)return;currentTerms=tokens(q);learn('need_submit',{terms:currentTerms,context:{term_count:currentTerms.length}});
 const section=$('#needResults'),grid=$('#needProductGrid'),reason=$('#needReason');section.classList.remove('hidden');$('#needTitle').textContent='مخارج لـ «'+q+'»';reason.innerHTML='نرتب النتائج بحسب صلتها بحاجتك، ثم يتعلم مَخْرَج تدريجيًا من النقر والسلة والشراء والتقييم — <b>من دون حفظ نص حاجتك الخام.</b>';grid.innerHTML='<div class="loading">جارٍ البحث عن أقرب مخرج…</div>';section.scrollIntoView({behavior:'smooth',block:'start'});
 try{const {products,learnedMap}=await fetchData(currentTerms);let ranked=products.map(p=>{const b=baseScore(p,currentTerms);return{...b,score:b.score+(learnedMap[p.id]||0),learnedBonus:learnedMap[p.id]||0,p}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
 if(!ranked.length)ranked=products.filter(p=>(p.product_variants||[]).some(v=>v.stock_quantity>0)).slice(0,4).map(p=>({p,score:0,reasons:[],learnedBonus:0}));
 if(!ranked.length){grid.innerHTML='<div class="empty"><b>لا يوجد مخرج تجاري لهذه الحاجة بعد.</b><br><span class="tiny">سنسجل نمط الحاجة كمعلومة مجمعة كي نعرف أين ينقص المتجر، لكن لن نخترع منتجًا غير موجود.</span></div>';return}
 grid.innerHTML=ranked.map((x,i)=>{const p=x.p,img=[...(p.product_images||[])].sort((a,b)=>a.sort_order-b.sort_order)[0]?.url,prices=(p.product_variants||[]).filter(v=>v.stock_quantity>0).map(v=>Number(v.price??p.base_price)),price=prices.length?Math.min(...prices):p.base_price;return '<article class="card need-card" data-need-product="'+p.id+'"><div class="need-rank">'+(i===0?'الأقرب لحاجتك':'خيار '+(i+1))+'</div><div class="pimg" '+(img?'style="background-image:url(\''+esc(img)+'\')"':'')+'></div><div class="pbody"><h3>'+esc(p.name)+'</h3>'+(p.benefit_summary?'<p class="muted need-why">'+esc(p.benefit_summary)+'</p>':'')+(x.reasons.length?'<div class="tiny">لأنه يرتبط بـ: '+esc(x.reasons.join(' · '))+'</div>':'')+'<div class="line" style="margin-top:10px"><span class="price">'+money(price)+'</span><button class="primary need-open" data-id="'+p.id+'">شاهده</button></div><div class="need-feedback"><span class="tiny">هل هذه التوصية مفيدة؟</span><button data-helpful="'+p.id+'">نعم</button><button data-not-helpful="'+p.id+'">لا</button></div></div></article>'}).join('');
 ranked.forEach(x=>learn('result_impression',{productId:x.p.id,terms:currentTerms,context:{rank:ranked.indexOf(x)+1}}));
 $$('.need-open',grid).forEach(b=>b.onclick=()=>{learn('product_open',{productId:b.dataset.id,terms:currentTerms});const card=document.querySelector('[data-open="'+CSS.escape(b.dataset.id)+'"]');if(card){card.click()}else{document.querySelector('#searchInput').value=ranked.find(x=>x.p.id===b.dataset.id)?.p.name||'';document.querySelector('#searchInput').dispatchEvent(new Event('input'));document.querySelector('#productGrid').scrollIntoView({behavior:'smooth'})}});
 $$('[data-helpful]',grid).forEach(b=>b.onclick=()=>{learn('feedback_helpful',{productId:b.dataset.helpful,terms:currentTerms});b.parentElement.innerHTML='<span class="tiny ok">شكرًا — تعلّمنا من هذه الإشارة.</span>'});
 $$('[data-not-helpful]',grid).forEach(b=>b.onclick=()=>{learn('feedback_not_helpful',{productId:b.dataset.notHelpful,terms:currentTerms});b.parentElement.innerHTML='<span class="tiny">وصلتنا الإشارة وسنحسن الترتيب مع الوقت.</span>'});
 }catch(e){console.error(e);grid.innerHTML='<div class="error">تعذر تشغيل محرك المَخْرَج الآن.</div>'}}
function init(){const input=$('#needInput'),btn=$('#needSolveBtn');if(!input||!btn)return;btn.onclick=()=>solve(input.value);input.addEventListener('keydown',e=>{if(e.key==='Enter')solve(input.value)});$$('[data-need]').forEach(b=>b.onclick=()=>{input.value=b.dataset.need;solve(input.value)});$('#clearNeedBtn').onclick=()=>{$('#needResults').classList.add('hidden');input.value='';currentTerms=[]};document.addEventListener('click',e=>{const open=e.target.closest?.('[data-open]');if(open&&!open.closest('#needProductGrid'))learn('product_open',{productId:open.dataset.open,terms:currentTerms})},true)}
window.MakhrajLearning={event:learn,getTerms:()=>currentTerms,getSessionKey:()=>sessionKey};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();