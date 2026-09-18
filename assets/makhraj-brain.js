(()=>{'use strict';
const cfg=window.MAKHRAJ_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=t=>({catalog_gap:'فجوة في الكتالوج',ranking_change:'تحسين الترتيب',bundle_idea:'فكرة مخرج مركب',content_improvement:'تحسين محتوى',ux_improvement:'تحسين تجربة',inventory_opportunity:'فرصة مخزون'})[t]||t;
function skeleton(host){host.innerHTML='<div class="brain-grid"><div class="brain-kpi"><span>تجارب آخر 30 يوم</span><b>…</b></div><div class="brain-kpi"><span>أفكار تطوير</span><b>…</b></div><div class="brain-kpi"><span>روابط تعلم</span><b>…</b></div></div><div class="brain-card"><h3>عقل مَخْرَج يعمل</h3><p>جارٍ قراءة التجارب والتعلم…</p></div>'}
async function loadBrain(){
 const host=$('#brainContent');if(!host)return;skeleton(host);
 try{
  const [p,t,e]=await Promise.all([
   sb.from('store_improvement_proposals').select('*').order('created_at',{ascending:false}).limit(100),
   sb.from('learned_product_terms').select('term,product_id,score,interactions,conversions').order('score',{ascending:false}).limit(40),
   sb.from('learning_events').select('id',{count:'exact',head:true}).gte('created_at',new Date(Date.now()-30*864e5).toISOString())
  ]);
  const fatal=p.error||t.error||e.error;if(fatal)throw fatal;
  const proposals=p.data||[],terms=t.data||[],open=proposals.filter(x=>x.status==='draft');
  host.innerHTML='<div class="brain-hero"><div><span class="brain-live">● يعمل الآن</span><h2>عقل مَخْرَج</h2><p>يتعلم من الحاجة ← النتيجة ← النقر ← السلة ← الطلب ← التقييم. يحسن الترتيب تلقائيًا، أما تغييرات المتجر الكبيرة فتحتاج موافقتك.</p></div><button class="btn primary" id="brainAnalyze">حلّل التجارب</button></div>'+
  '<div class="brain-grid"><div class="brain-kpi"><span>تجارب آخر 30 يوم</span><b>'+(e.count||0)+'</b><small>إشارات تعلم مسجلة</small></div><div class="brain-kpi"><span>أفكار تطوير مفتوحة</span><b>'+open.length+'</b><small>تحتاج قرار الإدارة</small></div><div class="brain-kpi"><span>روابط تعلم</span><b>'+terms.length+'</b><small>حاجة ↔ منتج</small></div></div>'+
  '<div class="brain-card"><div class="sectionhead"><div><h3>مقترحات التطوير</h3><div class="tiny">يولدها النظام من الاستخدام الحقيقي</div></div></div>'+(proposals.length?proposals.map(x=>'<div class="brain-proposal"><div class="row"><b>'+esc(x.title)+'</b><span class="status">'+esc(x.status)+'</span></div><div class="tiny brain-type">'+label(x.proposal_type)+'</div><p>'+esc(x.rationale)+'</p>'+(x.status==='draft'?'<div class="toolbar"><button class="btn primary" data-approve="'+x.id+'">اعتماد</button><button class="btn" data-reject="'+x.id+'">رفض</button></div>':'')+'</div>').join(''):'<div class="brain-empty"><b>لا توجد مقترحات بعد</b><span>هذا طبيعي قبل وجود استخدام حقيقي. كلما استخدم العملاء «أوجد لي مخرجًا» ستبدأ البيانات بالتراكم.</span></div>')+'</div>'+
  '<div class="brain-card"><h3>ما الذي تعلّمه حتى الآن؟</h3>'+(terms.length?'<div class="brain-terms">'+terms.map(x=>'<div><b>'+esc(x.term)+'</b><span>قوة '+Number(x.score||0).toFixed(1)+' · '+x.interactions+' تفاعل · '+x.conversions+' تحويل</span></div>').join('')+'</div>':'<div class="brain-empty"><b>لم تتراكم روابط تعلم بعد</b><span>بعد إضافة المنتجات وبدء التجارب سيظهر هنا ما يفهمه النظام من سلوك العملاء.</span></div>')+'</div>'+
  '<div class="brain-safety"><b>قاعدة الأمان</b><span>العقل لا يغيّر الأسعار أو يحذف المنتجات أو يعدّل كود المتجر وحده. يتعلم الترتيب، ويقترح التغييرات الكبيرة لتراجعها أنت.</span></div>';
  $('#brainAnalyze')?.addEventListener('click',analyze);
  $$('[data-approve]',host).forEach(b=>b.onclick=()=>setProposal(b.dataset.approve,'approved'));
  $$('[data-reject]',host).forEach(b=>b.onclick=()=>setProposal(b.dataset.reject,'rejected'));
 }catch(err){console.error('Makhraj Brain',err);host.innerHTML='<div class="brain-error"><b>عقل مَخْرَج موجود، لكن تعذر قراءة بيانات التعلم الآن.</b><span>'+esc(err.message||'خطأ غير معروف')+'</span><button class="btn" id="brainRetry">إعادة المحاولة</button></div>';$('#brainRetry')?.addEventListener('click',loadBrain)}
}
async function analyze(){const b=$('#brainAnalyze');if(!b)return;b.disabled=true;b.textContent='جارٍ التحليل…';const {data,error}=await sb.rpc('generate_store_improvement_proposals');if(error){b.disabled=false;b.textContent='تعذر التحليل';return}b.textContent='اكتمل · '+(data||0)+' جديد';setTimeout(loadBrain,650)}
async function setProposal(id,status){const {data:{session}}=await sb.auth.getSession();const {error}=await sb.from('store_improvement_proposals').update({status,reviewed_at:new Date().toISOString(),reviewed_by:session?.user?.id||null}).eq('id',id);if(!error)loadBrain()}
function init(){document.addEventListener('click',e=>{const b=e.target.closest?.('[data-tab="brain"]');if(b)setTimeout(loadBrain,30)},true);if($('#brainTab')&&!$('#brainTab').classList.contains('hidden'))loadBrain()}
window.MakhrajBrain={load:loadBrain};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();