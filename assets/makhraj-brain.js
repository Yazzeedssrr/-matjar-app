(()=>{'use strict';
const cfg=window.MAKHRAJ_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function proposalLabel(t){return({catalog_gap:'فجوة في الكتالوج',ranking_change:'تحسين الترتيب',bundle_idea:'فكرة مخرج مركب',content_improvement:'تحسين محتوى',ux_improvement:'تحسين تجربة',inventory_opportunity:'فرصة مخزون'})[t]||t}
async function loadBrain(){
 const host=$('#brainContent');if(!host)return;
 host.innerHTML='<div class="empty">جارٍ قراءة ما تعلّمه مَخْرَج…</div>';
 const [p,t,e]=await Promise.all([
   sb.from('store_improvement_proposals').select('*').order('created_at',{ascending:false}).limit(100),
   sb.from('learned_product_terms').select('term,product_id,score,interactions,conversions,products(name)').order('score',{ascending:false}).limit(40),
   sb.from('learning_events').select('id,event_type,created_at',{count:'exact'}).gte('created_at',new Date(Date.now()-30*864e5).toISOString()).limit(1)
 ]);
 if(p.error||t.error){host.innerHTML='<div class="error">تعذر تحميل عقل مَخْرَج.</div>';return}
 const proposals=p.data||[],terms=t.data||[];
 host.innerHTML='<div class="stats grid" style="margin-bottom:14px"><div class="stat"><span class="tiny">تجارب آخر 30 يوم</span><b>'+(e.count||0)+'</b></div><div class="stat"><span class="tiny">أفكار تطوير مفتوحة</span><b>'+proposals.filter(x=>x.status==='draft').length+'</b></div><div class="stat"><span class="tiny">روابط تعلم</span><b>'+terms.length+'</b></div><div class="stat"><span class="tiny">المبدأ</span><b style="font-size:15px">يتعلم، لا يعدّل الكود وحده</b></div></div>'+
 '<div class="card" style="margin-bottom:14px"><div class="sectionhead"><div><h3>حلقة التعلم</h3><div class="tiny">الحاجة ← النتيجة ← النقر ← السلة ← الطلب ← التقييم ← تحسين الترتيب</div></div><button class="btn primary" id="brainAnalyze">حلل التجارب الآن</button></div><div class="notice">مَخْرَج يغيّر أوزان التوصية تلقائيًا من السلوك الفعلي، لكنه لا يغيّر الأسعار أو المنتجات أو الكود من تلقاء نفسه. التغييرات الكبيرة تظهر هنا كمقترحات تحتاج موافقة الإدارة.</div></div>'+
 '<div class="sectionhead"><div><h3>مقترحات التطوير</h3><div class="tiny">استنتاجات من الطلب الحقيقي، لا تخمينات</div></div></div><div id="brainProposals">'+(proposals.length?proposals.map(x=>'<div class="card" style="margin:8px 0"><div class="row"><div><span class="status">'+proposalLabel(x.proposal_type)+'</span><h3>'+esc(x.title)+'</h3></div><span class="status">'+esc(x.status)+'</span></div><p class="muted">'+esc(x.rationale)+'</p><div class="tiny">'+new Date(x.created_at).toLocaleString('ar-US')+'</div>'+(x.status==='draft'?'<div class="toolbar" style="margin-top:10px"><button class="btn primary" data-proposal-approve="'+x.id+'">اعتماد الفكرة</button><button class="btn" data-proposal-reject="'+x.id+'">رفض</button></div>':'')+'</div>').join(''):'<div class="empty">لا توجد مقترحات بعد. سيبدأ العقل بإنتاجها مع الاستخدام الحقيقي.</div>')+'</div>'+
 '<div class="sectionhead" style="margin-top:18px"><div><h3>ما الذي يتعلمه الآن؟</h3><div class="tiny">الكلمات والاحتياجات المرتبطة بالمنتجات من التجربة الفعلية</div></div></div><div class="tablewrap">'+(terms.length?'<table class="table"><thead><tr><th>الحاجة</th><th>المنتج</th><th>قوة التعلم</th><th>التفاعلات</th><th>التحويلات</th></tr></thead><tbody>'+terms.map(x=>'<tr><td><b>'+esc(x.term)+'</b></td><td>'+esc(x.products?.name||'—')+'</td><td>'+Number(x.score||0).toFixed(2)+'</td><td>'+x.interactions+'</td><td>'+x.conversions+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">لم تتراكم بيانات كافية بعد.</div>')+'</div>';
 $('#brainAnalyze')?.addEventListener('click',async()=>{const b=$('#brainAnalyze');b.disabled=true;b.textContent='جارٍ التحليل…';const {data,error}=await sb.rpc('generate_store_improvement_proposals');b.disabled=false;b.textContent=error?'فشل التحليل':'تم التحليل · '+(data||0)+' اقتراح جديد';setTimeout(loadBrain,700)});
 $$('[data-proposal-approve]',host).forEach(b=>b.onclick=()=>setProposal(b.dataset.proposalApprove,'approved'));
 $$('[data-proposal-reject]',host).forEach(b=>b.onclick=()=>setProposal(b.dataset.proposalReject,'rejected'));
}
async function setProposal(id,status){const {data:{session}}=await sb.auth.getSession();const {error}=await sb.from('store_improvement_proposals').update({status,reviewed_at:new Date().toISOString(),reviewed_by:session?.user?.id||null}).eq('id',id);if(!error)loadBrain()}
function init(){const btn=$('[data-tab="brain"]');if(btn)btn.addEventListener('click',()=>setTimeout(loadBrain,0));}
window.MakhrajBrain={load:loadBrain};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();