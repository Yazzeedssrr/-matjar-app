/* Admin controller v3. Existing tables, accounts, orders and product IDs are retained. */
(() => {
 'use strict';
 const cfg=window.MAKHRAJ_CONFIG;
 const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const $=id=>document.getElementById(id),all=(q,r=document)=>[...r.querySelectorAll(q)];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0));
 const langs={ar:'العربية',en:'English',es:'Español',fr:'Français',tr:'Türkçe',de:'Deutsch',it:'Italiano',pt:'Português',ru:'Русский',zh:'中文',ja:'日本語',ko:'한국어',hi:'हिन्दी',ur:'اردو',fa:'فارسی',bn:'বাংলা',id:'Bahasa Indonesia',vi:'Tiếng Việt',pl:'Polski',nl:'Nederlands',sv:'Svenska',uk:'Українська',ro:'Română',el:'Ελληνικά'};
 const S={session:null,profile:null,editor:null,products:[],orders:[],costs:{},settings:null,stripe:null,tickets:[],activeTab:'overview'};
 const os={pending:'بانتظار التأكيد',confirmed:'مؤكد',processing:'قيد التجهيز',shipped:'تم الشحن',delivered:'تم التسليم',cancelled:'ملغى',refunded:'مسترد'};
 const ps={paid:'مدفوع',unpaid:'غير مدفوع',failed:'فشل الدفع',authorized:'مصرح',partially_refunded:'استرداد جزئي',refunded:'مسترد'};
 function msg(id,text,kind=''){const e=$(id);if(e){e.textContent=text;e.className='msg '+kind;}}
 function gate(html){$('adminApp').classList.add('hidden');$('gate').classList.remove('hidden');$('gateBody').innerHTML=html;}
 function modal(html){$('modalCard').innerHTML=html;$('modal').classList.add('open');$('modal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';$('modalCard').querySelector('[data-close]')?.addEventListener('click',close);}
 function close(){$('modal').classList.remove('open');$('modal').setAttribute('aria-hidden','true');document.body.style.overflow='';}
 $('modal').addEventListener('click',e=>{if(e.target===$('modal'))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 async function guard(fn,id='overviewFeed'){try{return await fn();}catch(error){const e=$(id);if(e)e.innerHTML='<div class="msg err">تعذر التحميل. '+esc(error.message||'تحقق من الاتصال')+'</div>';}}
 function loginForm(note=''){
  gate('<div class="msg" aria-live="polite">'+esc(note)+'</div><input id="loginEmail" class="field" type="email" autocomplete="username" placeholder="البريد الإلكتروني"><input id="loginPass" class="field" type="password" autocomplete="current-password" placeholder="كلمة المرور"><button id="loginBtn" class="primary">تسجيل الدخول</button><div id="loginMsg" class="msg" aria-live="polite"></div>');
  $('loginBtn').onclick=async()=>{
   const b=$('loginBtn');b.disabled=true;msg('loginMsg','جارٍ الدخول…');
   try{const {data,error}=await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPass').value});if(error)throw error;S.session=data.session;await enter();}
   catch(error){msg('loginMsg',/Invalid login/.test(error.message)?'البريد أو كلمة المرور غير صحيحة.':error.message,'err');}finally{b.disabled=false;}
  };
 }
 async function logout(){if(S.editor?.busy)return;await S.editor?.flush();const {error}=await sb.auth.signOut();if(error){alert(error.message);return;}location.reload();}
 async function enter(){
  const {data,error}=await sb.from('profiles').select('id,full_name,role,preferred_language').eq('id',S.session.user.id).maybeSingle();
  if(error)throw error;
  if(data?.role!=='admin'){gate('<div class="msg err">هذا الحساب ليس حساب إدارة.</div><button id="badLogout" class="secondary">تسجيل الخروج</button>');$('badLogout').onclick=logout;return;}
  S.profile=data;$('gate').classList.add('hidden');$('adminApp').classList.remove('hidden');
  if(data.preferred_language&&!localStorage.getItem('makhraj-language'))window.MakhrajI18n?.setLanguage(data.preferred_language);
  if(!S.editor){
   S.editor=window.MakhrajEditor.create({client:sb,userId:data.id,onSaved:()=>loadProducts(),onEdit:()=>{showTab('products',false);$('formTitle').scrollIntoView({behavior:'smooth',block:'start'});}});
   await S.editor.init();bind();
  }
  await showTab('overview');
 }
 function bind(){
  $('logoutBtn').onclick=logout;
  all('.tab').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  const links={refreshOverview:()=>showTab('overview'),goProductsBtn:()=>showTab('products'),goSettingsBtn:()=>showTab('settings'),refreshProducts:()=>loadProducts(),refreshOrders:()=>loadOrders(),refreshCustomers:()=>loadCustomers(),refreshSupport:()=>loadSupport(),addCategoryBtn:()=>addCategory(),createCouponBtn:()=>createCoupon(),saveSettingsBtn:()=>saveSettings()};
  for(const [id,fn] of Object.entries(links))if($(id))$(id).onclick=()=>guard(fn);
  $('productSearch').oninput=renderProducts;$('orderStatusFilter').onchange=renderOrders;
  const header=$('inventory').parentElement.querySelector('.section-head');
  const exportBtn=document.createElement('button');exportBtn.id='exportCatalogBtn';exportBtn.className='secondary small';exportBtn.textContent='تصدير بيانات المنتجات';exportBtn.onclick=()=>S.editor.exportCatalog();header.append(exportBtn);
  const version=document.createElement('p');version.className='hint';version.textContent='إصدار حماية البيانات 2026.09.20 · ملف التصدير يشمل بيانات المنتجات والتكاليف وروابط الصور، وليس الصور والطلبات نفسها.';version.setAttribute('data-no-i18n','');$('adminApp').append(version);
 }
 function showTab(name,load=true){
  if(S.editor?.busy)return;
  S.activeTab=name;all('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));all('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+name));
  if(!load)return;
  const loaders={overview:loadOverview,products:async()=>{await Promise.all([loadProducts(),loadCategories()]);},orders:loadOrders,customers:loadCustomers,messages:loadSupport,promos:loadCoupons,settings:loadSettings};
  return guard(loaders[name]||(()=>{}),{products:'inventory',orders:'ordersList',customers:'customersList',messages:'supportInbox',promos:'couponsList',settings:'settingsMsg'}[name]||'overviewFeed');
 }
 async function loadProducts(){
  const {data,error}=await sb.from('products').select('*,categories(name),product_images(*),product_variants(*)').order('updated_at',{ascending:false});if(error)throw error;
  S.products=(data||[]).filter(p=>p.slug!=='makhraj-sandbox-stripe-test');
  const {data:costs,error:ce}=await sb.from('variant_costs').select('variant_id,cost_price');
  S.costs=ce?{}:Object.fromEntries((costs||[]).filter(c=>c.cost_price!==null).map(c=>[c.variant_id,Number(c.cost_price)]));renderProducts();
 }
 function renderProducts(){
  const q=$('productSearch').value.trim().toLowerCase();
  const list=S.products.filter(p=>!q||[p.name,p.brand,p.categories?.name,...(p.product_variants||[]).map(v=>v.sku)].join(' ').toLowerCase().includes(q));
  $('inventory').innerHTML=list.length?list.map(p=>{
   const variants=p.product_variants||[],v=variants[0],stock=variants.filter(x=>x.is_active).reduce((s,x)=>s+Number(x.stock_quantity),0),img=[...(p.product_images||[])].sort((a,b)=>a.sort_order-b.sort_order)[0]?.url;
   const cost=v?S.costs[v.id]:undefined;
   return '<article class="card-row product-row"><div class="thumb">'+(img?'<img src="'+esc(img)+'" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:12px">':'بدون صورة')+'</div><div><div class="row-head"><div class="row-title" data-no-i18n>'+esc(p.name)+'</div><span class="badge '+(p.status==='active'?'good':'warn')+'">'+esc({active:'منشور',draft:'مسودة',archived:'مؤرشف'}[p.status])+'</span></div><div class="meta" data-no-i18n>'+esc(p.categories?.name||'')+' · '+money(v?.price??p.base_price)+' · الكمية '+stock+'</div>'+(cost!==undefined?'<div class="meta" data-no-i18n>فرق السعر والتكلفة للوحدة: '+money(Number(v.price??p.base_price)-cost)+'</div>':'')+'<div class="row-actions"><button data-edit="'+p.id+'">تعديل</button><button data-stock="'+p.id+'">المخزون</button>'+(p.status==='active'?'<button data-share="'+p.id+'">مشاركة المنتج</button><button data-status="draft" data-product="'+p.id+'">إخفاء</button>':'<button data-review="'+p.id+'">مراجعة ونشر</button>')+(p.status!=='archived'?'<button data-status="archived" data-product="'+p.id+'">أرشفة</button>':'')+'</div></div></article>';
  }).join(''):'<div class="empty">لا توجد منتجات مطابقة. أضف منتجك الأول من النموذج.</div>';
  all('[data-edit]', $('inventory')).forEach(b=>b.onclick=()=>S.editor.edit(b.dataset.edit));
  all('[data-stock]', $('inventory')).forEach(b=>b.onclick=async()=>{await S.editor.edit(b.dataset.stock);$('stock').focus();});
  all('[data-review]', $('inventory')).forEach(b=>b.onclick=()=>S.editor.edit(b.dataset.review));
  all('[data-share]', $('inventory')).forEach(b=>b.onclick=()=>shareProduct(b.dataset.share));
  all('[data-status]', $('inventory')).forEach(b=>b.onclick=()=>guard(()=>setProductStatus(b.dataset.product,b.dataset.status),'inventory'));
 }
 async function setProductStatus(id,status){
  if(S.editor?.busy)return;if(status==='archived'&&!confirm('أرشفة المنتج دون حذف بياناته أو طلباته؟'))return;
  const p=S.products.find(x=>x.id===id);if(!p)return;
  const {data,error}=await sb.from('products').update({status}).eq('id',id).eq('updated_at',p.updated_at).select('id');if(error)throw error;
  if(!data.length)throw Error('تغير المنتج. حدّث القائمة وراجع أحدث نسخة.');await loadProducts();
 }
 async function shareProduct(id){
  const p=S.products.find(x=>x.id===id);if(!p||p.status!=='active')return;
  const url=new URL('app.html',location.href);url.searchParams.set('product',id);
  try{if(navigator.share)await navigator.share({title:p.name,url:url.href});else{await navigator.clipboard.writeText(url.href);alert('تم نسخ رابط المنتج.');}}catch(e){if(e.name!=='AbortError')alert('تعذرت المشاركة.');}
 }
 async function loadCategories(){
  const data=await S.editor.refreshCategories();$('categoryList').innerHTML=data.map(c=>'<span class="chip" data-no-i18n>'+esc(c.name)+'</span>').join('');
 }
 async function addCategory(){
  const name=$('newCategoryName').value.trim();if(name.length<2||name.length>100){alert('اكتب اسم قسم من 2 إلى 100 حرف.');return;}
  const {error}=await sb.from('categories').insert({name,slug:'category-'+crypto.randomUUID(),is_active:true,sort_order:80});if(error)throw error;$('newCategoryName').value='';await loadCategories();
 }
 function testOrder(o){return o.payment_method==='test'||(o.payments||[]).some(p=>String(p.checkout_session_id||'').startsWith('cs_test_'));}
 function verifiedLive(o){return !testOrder(o)&&(o.payment_method==='cash_on_delivery'||(o.payments||[]).some(p=>String(p.checkout_session_id||'').startsWith('cs_live_')));}
 async function loadOrders(){
  const {data,error}=await sb.from('orders').select('*,order_items(*),payments(checkout_session_id,status)').order('created_at',{ascending:false}).limit(100);if(error)throw error;S.orders=data||[];renderOrders();
 }
 function renderOrders(){
  const f=$('orderStatusFilter').value,list=S.orders.filter(o=>!f||o.status===f);
  $('ordersList').innerHTML=list.length?list.map(o=>{const a=o.shipping_address||{};return '<article class="card-row"><div class="row-head"><b data-no-i18n>MK-'+String(o.order_number).padStart(6,'0')+'</b><b data-no-i18n>'+money(o.total)+'</b></div><div class="meta">'+esc(os[o.status]||o.status)+' · '+esc(ps[o.payment_status]||o.payment_status)+(testOrder(o)?' · اختبار — ليس إيرادًا حقيقيًا':'')+'</div><div class="meta" data-no-i18n>'+(o.order_items||[]).map(i=>esc(i.product_name)+' × '+i.quantity).join('، ')+'</div><div class="order-address meta" data-no-i18n>'+esc([a.recipient_name,a.phone,a.line1,a.line2,a.city,a.state,a.postal_code].filter(Boolean).join(' · '))+'</div><div class="row-actions"><button data-order="'+o.id+'">إدارة الطلب</button></div></article>';}).join(''):'<div class="empty">لا توجد طلبات مطابقة.</div>';
  all('[data-order]',$('ordersList')).forEach(b=>b.onclick=()=>orderModal(b.dataset.order));
 }
 function orderModal(id){
  const o=S.orders.find(x=>x.id===id);if(!o)return;
  const next={pending:['confirmed'],confirmed:['processing'],processing:['shipped'],shipped:['delivered'],delivered:[],cancelled:[],refunded:[]};
  const options=[o.status,...(next[o.status]||[])];
  modal('<div class="modal-title"><h2 data-no-i18n>MK-'+String(o.order_number).padStart(6,'0')+'</h2><button class="close" data-close>×</button></div><p class="hint">تغيير حالة الطلب لا ينفّذ استردادًا ماليًا. الإلغاء والاسترداد يحتاجان مسار الدفع المخصص.</p><div class="stack"><label>حالة الطلب<select id="mOrderStatus" class="field">'+options.map(s=>'<option value="'+s+'">'+esc(os[s]||s)+'</option>').join('')+'</select></label><label>شركة الشحن<input id="mCarrier" class="field" value="'+esc(o.shipping_carrier||'')+'"></label><label>رقم التتبع<input id="mTracking" class="field" value="'+esc(o.tracking_number||'')+'"></label><button id="saveOrder" class="primary">حفظ</button><div id="orderMsg" class="msg"></div></div>');
  $('saveOrder').onclick=async()=>{
   const status=$('mOrderStatus').value;if(status!==o.status&&o.payment_method==='online'&&o.payment_status!=='paid'){msg('orderMsg','انتظر تأكيد الدفع الإلكتروني قبل تجهيز الطلب.','err');return;}
   const row={status,shipping_carrier:$('mCarrier').value.trim()||null,tracking_number:$('mTracking').value.trim()||null};if(status==='shipped'&&!o.shipped_at)row.shipped_at=new Date().toISOString();if(status==='delivered'&&!o.delivered_at)row.delivered_at=new Date().toISOString();
   $('saveOrder').disabled=true;const {data,error}=await sb.from('orders').update(row).eq('id',id).eq('updated_at',o.updated_at).select('id');
   if(error||!data.length){$('saveOrder').disabled=false;msg('orderMsg',error?.message||'تغير الطلب. أغلق النافذة وحدّث القائمة.','err');return;}close();await guard(loadOrders,'ordersList');
  };
 }
 async function loadOverview(){
  await Promise.all([loadProducts(),loadOrders(),loadSettings()]);
  const live=S.orders.filter(o=>o.payment_status==='paid'&&verifiedLive(o));
  $('mRevenue').textContent=money(live.reduce((n,o)=>n+Number(o.total),0));$('mOrders').textContent=S.orders.length;$('mProducts').textContent=S.products.filter(p=>p.status==='active').length;
  const low=S.products.filter(p=>p.status==='active'&&(p.product_variants||[]).some(v=>v.is_active&&Number(v.stock_quantity)<=Number(v.low_stock_threshold))).length;$('mLow').textContent=low;
  let margin=0,complete=live.length>0;for(const o of live){for(const i of o.order_items||[]){if(S.costs[i.variant_id]===undefined)complete=false;else margin+=Number(i.line_total)-S.costs[i.variant_id]*Number(i.quantity);}margin-=Number(o.discount_total||0);}
  $('mGrossProfit').textContent=complete?money(margin):'—';
  const tests=S.orders.filter(testOrder).length;
  $('overviewFeed').innerHTML='<div class="card-row">'+tests+' طلب تجريبي مستبعد من الإيراد الحقيقي.</div><div class="card-row">'+low+' منتج بمخزون منخفض.</div><div class="hint">الإحصاءات تخص أحدث 100 طلب. المبيعات المدفوعة تستبعد مدفوعات الاختبار والدفعات غير المتحقق من نوعها. هامش المنتجات تقديري بالتكاليف الحالية وبعد خصم الطلب، وليس صافي الربح بعد الشحن والرسوم والضرائب والاستردادات.</div>';
  const active=S.products.filter(p=>p.status==='active');
  const checks=[['منتج منشور',active.length>0],['مخزون متوفر',active.some(p=>p.product_variants.some(v=>v.is_active&&v.stock_quantity>0))],['صور المنتجات',active.length>0&&active.every(p=>p.product_images.length>0)],['تكلفة مسجلة',active.length>0&&active.every(p=>p.product_variants.length>0&&p.product_variants.every(v=>S.costs[v.id]!==undefined))],['إتمام الطلب مفعّل',!!S.settings?.checkout_enabled],['إعداد Stripe مباشر',S.stripe?.mode==='live'&&S.stripe?.ready===true]];
  $('launchScore').textContent=Math.round(checks.filter(x=>x[1]).length/checks.length*100)+'%';
  $('launchChecklist').innerHTML=checks.map(([name,ok])=>'<div class="launch-step '+(ok?'done':'todo')+'"><span class="launch-icon">'+(ok?'✓':'!')+'</span><b>'+name+'</b></div>').join('')+'<div class="hint">هذه قائمة تجهيز تقنية، وليست ضمانًا لجاهزية النشاط أو الشحن أو الالتزامات القانونية.</div>';
 }
 async function loadSettings(){
  const {data,error}=await sb.from('store_settings').select('*').eq('id',1).single();if(error)throw error;S.settings=data;
  const fields={storeName:data.store_name,shippingFee:data.standard_shipping_fee,freeShipping:data.free_shipping_threshold,supportEmail:data.support_email||''};for(const [id,v] of Object.entries(fields))$(id).value=v;
  $('checkoutEnabled').checked=data.checkout_enabled;$('stripeEnabled').checked=data.stripe_online_enabled;$('codEnabled').checked=data.cash_on_delivery_enabled;
  try{const r=await sb.functions.invoke('stripe-status',{body:{}});S.stripe=r.error?null:r.data;}catch{S.stripe=null;}
  $('paymentModeTitle').textContent=S.stripe?.mode==='test'?'Stripe Sandbox':S.stripe?.mode==='live'?'Stripe Live':'يلزم التحقق من Stripe';
  $('paymentModeText').textContent=S.stripe?.mode==='test'?'دفع تجريبي فقط. لا تستلم أموالًا حقيقية في هذه البيئة.':'وجود مفتاح لا يكفي وحده؛ راجع تفعيل الحساب ووصول إشعارات الدفع قبل استقبال العملاء.';
 }
 async function saveSettings(){
  let fee,free;try{fee=window.MakhrajEditor.moneyValue($('shippingFee').value);free=window.MakhrajEditor.moneyValue($('freeShipping').value);}catch(e){msg('settingsMsg',e.message,'err');return;}
  const email=$('supportEmail').value.trim();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg('settingsMsg','تحقق من بريد الدعم.','err');return;}
  const {error}=await sb.from('store_settings').update({store_name:$('storeName').value.trim()||'مَخْرَج',standard_shipping_fee:fee,free_shipping_threshold:free,support_email:email||null,checkout_enabled:$('checkoutEnabled').checked,stripe_online_enabled:$('stripeEnabled').checked,cash_on_delivery_enabled:$('codEnabled').checked}).eq('id',1);
  msg('settingsMsg',error?error.message:'حُفظت الإعدادات. لم تتغير مفاتيح Stripe أو بيئته.',error?'err':'ok');
 }
 async function loadCustomers(){
  const {data,error}=await sb.from('profiles').select('id,full_name,phone,role,created_at').order('created_at',{ascending:false}).limit(100);if(error)throw error;
  $('customersList').innerHTML=(data||[]).filter(p=>p.role!=='admin').map(p=>'<article class="card-row"><b data-no-i18n>'+esc(p.full_name||'عميل')+'</b><div class="meta" data-no-i18n>'+esc(p.phone||'')+'</div></article>').join('')||'<div class="empty">لا يوجد عملاء مسجلون بعد.</div>';
 }
 async function loadCoupons(){
  const {data,error}=await sb.from('coupons').select('*').order('created_at',{ascending:false});if(error)throw error;
  $('couponsList').innerHTML=(data||[]).map(c=>'<div class="card-row"><div class="row-head"><b data-no-i18n>'+esc(c.code)+'</b><span data-no-i18n>'+(c.discount_type==='percent'?c.discount_value+'%':money(c.discount_value))+'</span></div><div class="meta">'+(c.is_active?'فعال':'موقوف')+'</div><div class="row-actions"><button data-coupon="'+c.id+'">'+(c.is_active?'إيقاف':'تفعيل')+'</button></div></div>').join('')||'<div class="empty">لا توجد أكواد خصم.</div>';
  all('[data-coupon]',$('couponsList')).forEach(b=>b.onclick=async()=>{const c=data.find(x=>x.id===b.dataset.coupon);const r=await sb.from('coupons').update({is_active:!c.is_active}).eq('id',c.id);if(r.error)alert(r.error.message);else await guard(loadCoupons,'couponsList');});
 }
 async function createCoupon(){
  let val,min;const code=$('couponCode').value.trim().toUpperCase(),type=$('couponType').value;
  try{val=Number(window.MakhrajEditor.moneyValue($('couponValue').value));min=Number(window.MakhrajEditor.moneyValue($('couponMin').value));if(!code||val<=0||type==='percent'&&val>100)throw Error('تحقق من الكود والقيمة. النسبة يجب ألا تتجاوز 100%.');}catch(e){msg('couponMsg',e.message,'err');return;}
  const {error}=await sb.from('coupons').insert({code,discount_type:type,discount_value:val,minimum_order:min,is_active:true});msg('couponMsg',error?error.message:'تم إنشاء الكود.',error?'err':'ok');if(!error){$('couponCode').value='';await loadCoupons();}
 }
 async function loadSupport(){
  const {data,error}=await sb.from('support_tickets').select('*').order('updated_at',{ascending:false}).limit(100);if(error)throw error;S.tickets=data||[];
  $('supportInbox').innerHTML=S.tickets.map(t=>'<button class="support-row card-row" data-ticket="'+t.id+'"><b data-no-i18n>'+esc(t.subject)+'</b><div class="meta" data-no-i18n>'+esc(t.status)+' · '+new Date(t.updated_at).toLocaleString()+'</div></button>').join('')||'<div class="empty">لا توجد محادثات دعم بعد.</div>';
  all('[data-ticket]',$('supportInbox')).forEach(b=>b.onclick=()=>guard(()=>openTicket(b.dataset.ticket),'supportInbox'));
 }
 async function openTicket(id){
  const [{data:t,error:te},{data:messages,error:me}]=await Promise.all([sb.from('support_tickets').select('*').eq('id',id).single(),sb.from('support_messages').select('*').eq('ticket_id',id).order('created_at',{ascending:false}).limit(100)]);if(te||me)throw te||me;
  const rows=(messages||[]).reverse(),key='makhraj-reply:'+S.profile.id+':'+id;
  let target='ar',reply='';try{target=localStorage.getItem('makhraj-admin-support-language')||window.MakhrajI18n?.language||'ar';reply=sessionStorage.getItem(key)||'';}catch{}
  modal('<div class="modal-title"><h2 data-no-i18n>'+esc(t.subject)+'</h2><button class="close" data-close>×</button></div><label>لغة الترجمة<select id="adminSupportLanguage" class="field" data-no-i18n>'+Object.entries(langs).map(([code,name])=>'<option value="'+code+'" '+(code===target?'selected':'')+'>'+name+'</option>').join('')+'</select></label><p class="hint">عند الضغط على الترجمة تُرسل نصوص الرسائل إلى مزود ترجمة خارجي. الأصل محفوظ؛ راجع الأرقام والتوافق في النص الأصلي.</p><button id="translateThread" class="secondary">ترجمة الرسائل</button><div class="support-thread">'+rows.map(m=>'<div class="chat-bubble '+(m.is_staff?'staff':'customer')+'"><div class="meta">'+(m.is_staff?'دعم مَخْرَج':'العميل')+'</div><div class="chat-original" dir="auto" data-no-i18n>'+esc(m.message)+'</div><div class="chat-translation" id="translation-'+m.id+'" dir="auto" data-no-i18n></div></div>').join('')+'</div><div class="stack"><label>حالة التذكرة<select id="ticketStatus" class="field">'+['open','in_progress','waiting_customer','resolved','closed'].map(s=>'<option value="'+s+'" '+(s===t.status?'selected':'')+'>'+s+'</option>').join('')+'</select></label><textarea id="adminReply" class="field" rows="4" placeholder="رد على العميل"></textarea><div class="actions"><button id="saveTicketStatus" class="secondary">حفظ الحالة</button><button id="sendAdminReply" class="primary">إرسال الرد</button></div><div id="adminReplyMsg" class="msg"></div></div>');
  $('adminReply').value=reply;$('adminReply').oninput=()=>{try{sessionStorage.setItem(key,$('adminReply').value);}catch{}};
  $('adminSupportLanguage').onchange=e=>{try{localStorage.setItem('makhraj-admin-support-language',e.target.value);}catch{}};
  $('translateThread').onclick=async()=>{const b=$('translateThread'),language=$('adminSupportLanguage').value;b.disabled=true;for(const m of rows){const box=$('translation-'+m.id);if(!box?.isConnected)break;box.textContent='جارٍ الترجمة…';try{const r=await sb.functions.invoke('translate-message',{body:{message_id:m.id,target_language:language}});if(box.isConnected)box.textContent=r.error?'تعذرت الترجمة الآن؛ النص الأصلي متاح.':r.data?.translated_text||'تعذرت الترجمة الآن.';}catch{box.textContent='تعذرت الترجمة الآن.';}}if(b.isConnected)b.disabled=false;};
  $('saveTicketStatus').onclick=async()=>{const r=await sb.from('support_tickets').update({status:$('ticketStatus').value,updated_at:new Date().toISOString()}).eq('id',id);msg('adminReplyMsg',r.error?r.error.message:'تم حفظ الحالة.',r.error?'err':'ok');};
  $('sendAdminReply').onclick=async()=>{const b=$('sendAdminReply'),text=$('adminReply').value.trim();if(!text||text.length>5000){msg('adminReplyMsg','اكتب رسالة من 1 إلى 5000 حرف.','err');return;}b.disabled=true;const {error}=await sb.from('support_messages').insert({ticket_id:id,sender_user_id:S.profile.id,message:text,is_staff:true,source_language:'auto'});if(error){b.disabled=false;msg('adminReplyMsg',error.message,'err');return;}try{sessionStorage.removeItem(key);}catch{}await openTicket(id);await loadSupport();};
 }
 document.addEventListener('makhraj:languagechange',e=>{if(S.profile?.id&&e.detail?.language)sb.from('profiles').update({preferred_language:e.detail.language}).eq('id',S.profile.id).then(({error})=>{if(error)console.warn('Language preference could not be synced');});});
 async function init(){const {data,error}=await sb.auth.getSession();if(error)throw error;S.session=data.session;if(!S.session){loginForm();return;}await enter();}
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
 window.MakhrajAdmin={version:'2026.09.20-safety2'};
 init().catch(e=>loginForm('تعذر تشغيل الإدارة. تحقق من الاتصال ثم سجّل الدخول.'));
})();
