(() => {
'use strict';
const cfg=window.MAKHRAJ_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0));
const slugify=s=>String(s||'').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
const state={session:null,profile:null,categories:[],products:[],orders:[],customers:[],coupons:[],tickets:[],settings:null,files:[],editing:null,activeTicket:null};

function showGate(html){$('#adminApp').classList.add('hidden');$('#gate').classList.remove('hidden');$('#gateBody').innerHTML=html}
function showApp(){$('#gate').classList.add('hidden');$('#adminApp').classList.remove('hidden')}
function msg(id,text,type=''){const e=$(id); if(!e)return; e.textContent=text||''; e.className='msg '+type}
function openModal(html){$('#modalCard').innerHTML=html;$('#modal').classList.add('open');$('#modal').setAttribute('aria-hidden','false'); const c=$('[data-close]',$('#modalCard'));if(c)c.onclick=closeModal}
function closeModal(){$('#modal').classList.remove('open');$('#modal').setAttribute('aria-hidden','true')}
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal()});

async function init(){
 const {data:{session}}=await sb.auth.getSession(); state.session=session;
 if(!session){renderLogin();return}
 await enter();
}
function renderLogin(){
 showGate('<input id="loginEmail" class="field" type="email" inputmode="email" placeholder="البريد الإلكتروني"><input id="loginPass" class="field" type="password" placeholder="كلمة المرور"><button id="loginBtn" class="primary">تسجيل الدخول</button><div id="loginMsg" class="msg"></div>');
 $('#loginBtn').onclick=async()=>{const b=$('#loginBtn'),m=$('#loginMsg');b.disabled=true;m.textContent='جارٍ الدخول…';const {data,error}=await sb.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPass').value});b.disabled=false;if(error){m.textContent='تعذر الدخول: '+error.message;m.className='msg err';return}state.session=data.session;await enter()};
}
async function enter(){
 const {data,error}=await sb.from('profiles').select('*').eq('id',state.session.user.id).maybeSingle();
 if(error||!data||data.role!=='admin'){showGate('<div class="danger">هذا الحساب لا يملك صلاحية الإدارة.</div><button id="badLogout" class="secondary">تسجيل الخروج</button>');$('#badLogout').onclick=logout;return}
 state.profile=data;
 if(state.profile?.preferred_language && !localStorage.getItem('makhraj-language')) window.MakhrajI18n?.setLanguage(state.profile.preferred_language);
 showApp();bind();await loadAll();switchTab('overview');
}
async function logout(){await sb.auth.signOut();state.session=null;renderLogin()}

function bind(){
 $('#logoutBtn').onclick=logout;
 $$('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
 $('#refreshOverview').onclick=loadOverview;
 $('#refreshProducts').onclick=loadProducts;
 $('#refreshOrders').onclick=loadOrders;
 $('#refreshCustomers').onclick=loadCustomers;
 const refreshSupport=$('#refreshSupport'); if(refreshSupport) refreshSupport.onclick=loadSupport;
 document.addEventListener('makhraj:languagechange',async e=>{
   const language=e.detail?.language;
   if(state.session&&language){
     await sb.from('profiles').update({preferred_language:language}).eq('id',state.session.user.id);
     if(state.activeTicket) openAdminTicket(state.activeTicket);
   }
 });
 $('#resetProductBtn').onclick=resetProductForm;
 $('#saveDraftBtn').onclick=()=>saveProduct('draft');
 $('#publishBtn').onclick=()=>saveProduct('active');
 $('#productSearch').oninput=renderInventory;
 $('#orderStatusFilter').onchange=renderOrders;
 $('#addCategoryBtn').onclick=addCategory;
 $('#createCouponBtn').onclick=createCoupon;
 $('#saveSettingsBtn').onclick=saveSettings;
 $('#photos').onchange=e=>{state.files=[...e.target.files].slice(0,6);renderSelectedPhotos()};
}
function switchTab(name){
 $$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
 $$('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+name));
 if(name==='overview')loadOverview();
 if(name==='products')Promise.all([loadCategories(),loadProducts()]);
 if(name==='orders')loadOrders();
 if(name==='customers')loadCustomers();
 if(name==='messages')loadSupport();
 if(name==='promos')loadCoupons();
 if(name==='settings')loadSettings();
}
async function loadAll(){await Promise.all([loadCategories(),loadProducts(),loadOrders(),loadCustomers(),loadSupport(),loadCoupons(),loadSettings()])}

async function loadOverview(){
 await Promise.all([loadProducts(),loadOrders()]);
 const paid=state.orders.filter(o=>['paid','partially_refunded'].includes(o.payment_status));
 $('#mRevenue').textContent=money(paid.reduce((s,o)=>s+Number(o.total||0),0));
 $('#mOrders').textContent=state.orders.length;
 $('#mProducts').textContent=state.products.filter(p=>p.status==='active').length;
 const low=state.products.filter(p=>(p.product_variants||[]).some(v=>v.is_active&&Number(v.stock_quantity)<=Number(v.low_stock_threshold||1))).length;
 $('#mLow').textContent=low;
 const pending=state.orders.filter(o=>['pending','confirmed','processing'].includes(o.status)).length;
 $('#overviewFeed').innerHTML=[
   pending?'<div class="card-row"><b>'+pending+' طلب يحتاج متابعة</b><div class="meta">راجع الطلبات المؤكدة والجارية.</div></div>':'',
   low?'<div class="card-row"><b>'+low+' منتج مخزونه منخفض</b><div class="meta">راجع الكميات قبل استقبال طلب جديد.</div></div>':'',
   !pending&&!low?'<div class="card-row"><b>لا توجد تنبيهات تشغيلية الآن.</b></div>':''
 ].join('');
 if(state.settings){$('#paymentModeTitle').textContent=state.settings.test_mode?'Stripe Sandbox':'Stripe Live';$('#paymentModeText').textContent=state.settings.test_mode?'الدفع الإلكتروني يعمل في وضع الاختبار حاليًا.':'المتجر في وضع الدفع الحقيقي.'}
}

async function loadCategories(){
 const {data,error}=await sb.from('categories').select('*').eq('is_active',true).order('sort_order').order('name');
 if(error)return;state.categories=data||[];
 $('#category').innerHTML=state.categories.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
 $('#categoryList').innerHTML=state.categories.map(c=>'<span class="chip">'+esc(c.name)+'</span>').join('');
}
async function addCategory(){
 const name=$('#newCategoryName').value.trim();if(!name)return;
 const slug=(slugify(name)||'category')+'-'+Date.now().toString(36).slice(-4);
 const {error}=await sb.from('categories').insert({name,slug,is_active:true,sort_order:80});
 if(error){alert(error.message);return}$('#newCategoryName').value='';await loadCategories();
}

async function loadProducts(){
 const {data,error}=await sb.from('products').select('id,name,slug,description,brand,status,base_price,compare_at_price,featured,category_id,specifications,categories(name,slug),product_images(id,url,alt_text,sort_order),product_variants(id,sku,barcode,title,price,stock_quantity,low_stock_threshold,weight_grams,attributes,is_active)').order('updated_at',{ascending:false});
 if(error){$('#inventory').innerHTML='<div class="danger">'+esc(error.message)+'</div>';return}
 state.products=(data||[]).filter(p=>p.slug!=='makhraj-sandbox-stripe-test');renderInventory();
}
function renderInventory(){
 const q=($('#productSearch')?.value||'').trim().toLowerCase();
 const list=state.products.filter(p=>{const v=(p.product_variants||[])[0];return !q||[p.name,p.categories?.name,v?.sku,p.brand].join(' ').toLowerCase().includes(q)});
 $('#inventory').innerHTML=list.length?list.map(p=>{const imgs=[...(p.product_images||[])].sort((a,b)=>a.sort_order-b.sort_order),v=(p.product_variants||[])[0],stock=Number(v?.stock_quantity||0),img=imgs[0]?.url||'',badge=p.status==='active'?'<span class="badge good">منشور</span>':p.status==='draft'?'<span class="badge warn">مسودة</span>':'<span class="badge bad">مؤرشف</span>';return '<article class="card-row product-row"><div class="thumb" '+(img?'style="background-image:url(\''+esc(img)+'\')"':'')+'>'+(img?'':'بدون صورة')+'</div><div><div class="row-head"><div><div class="row-title">'+esc(p.name)+'</div><div class="meta">'+esc(p.categories?.name||'بدون قسم')+'</div></div>'+badge+'</div><div class="meta"><span class="price">'+money(v?.price??p.base_price)+'</span> · مخزون '+stock+(v?.sku?' · '+esc(v.sku):'')+'</div><div class="row-actions"><button data-edit="'+p.id+'">تعديل</button>'+(p.status!=='active'?'<button data-status="'+p.id+'" data-to="active">نشر</button>':'<button data-status="'+p.id+'" data-to="draft">إخفاء</button>')+'<button data-stock="'+p.id+'">المخزون</button>'+(p.status!=='archived'?'<button data-status="'+p.id+'" data-to="archived">أرشفة</button>':'')+'</div></div></article>'}).join(''):'<div class="empty">لا توجد منتجات بعد.</div>';
 $$('[data-edit]',$('#inventory')).forEach(b=>b.onclick=()=>editProduct(b.dataset.edit));
 $$('[data-status]',$('#inventory')).forEach(b=>b.onclick=()=>setProductStatus(b.dataset.status,b.dataset.to));
 $$('[data-stock]',$('#inventory')).forEach(b=>b.onclick=()=>stockModal(b.dataset.stock));
}
async function setProductStatus(id,status){const {error}=await sb.from('products').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);else await loadProducts()}
function editProduct(id){
 const p=state.products.find(x=>x.id===id);if(!p)return;const v=(p.product_variants||[])[0],s=p.specifications||{};
 state.editing=p.id;$('#formTitle').textContent='تعديل المنتج';$('#name').value=p.name||'';$('#price').value=v?.price??p.base_price??'';$('#comparePrice').value=p.compare_at_price??'';$('#stock').value=v?.stock_quantity??0;$('#category').value=p.category_id||'';$('#brand').value=p.brand||'';$('#sku').value=v?.sku||'';$('#barcode').value=v?.barcode||'';$('#weight').value=v?.weight_grams??'';$('#partNumber').value=s.part_number||'';$('#compatibility').value=s.compatibility||s.compatible_years||'';$('#position').value=s.position||'';$('#condition').value=s.condition||'جديد';$('#description').value=p.description||'';state.files=[];$('#photos').value='';$('#photoPreview').innerHTML='';$('#existingPhotos').innerHTML=(p.product_images||[]).sort((a,b)=>a.sort_order-b.sort_order).map(i=>'<img src="'+esc(i.url)+'" alt="">').join('');window.scrollTo({top:0,behavior:'smooth'});switchTab('products')
}
function resetProductForm(){state.editing=null;$('#formTitle').textContent='إضافة منتج';['name','price','comparePrice','brand','sku','barcode','weight','partNumber','compatibility','position','description'].forEach(id=>$('#'+id).value='');$('#stock').value='1';$('#condition').value='جديد';$('#photos').value='';$('#photoPreview').innerHTML='';$('#existingPhotos').innerHTML='';state.files=[];msg('#formMsg','')}
function renderSelectedPhotos(){const p=$('#photoPreview');p.innerHTML='';state.files.forEach(f=>{const i=document.createElement('img');i.src=URL.createObjectURL(f);p.appendChild(i)})}
async function saveProduct(status){
 const name=$('#name').value.trim(),price=Number($('#price').value),stock=Math.max(0,Math.floor(Number($('#stock').value||0))),category_id=$('#category').value;
 if(!name||!Number.isFinite(price)||price<=0||!category_id){msg('#formMsg','اسم المنتج والسعر والقسم مطلوبة.','err');return}
 for(const f of state.files){if(f.size>5*1024*1024){msg('#formMsg','إحدى الصور أكبر من 5MB.','err');return}}
 const specs={condition:$('#condition').value}; const part=$('#partNumber').value.trim(),comp=$('#compatibility').value.trim(),pos=$('#position').value.trim();if(part)specs.part_number=part;if(comp)specs.compatibility=comp;if(pos)specs.position=pos;
 const productRow={category_id,name,description:$('#description').value.trim()||null,status,base_price:price,compare_at_price:Number($('#comparePrice').value)||null,brand:$('#brand').value.trim()||null,specifications:specs,tags:[$('#brand').value.trim(),comp,part].filter(Boolean),updated_at:new Date().toISOString()};
 $('#saveDraftBtn').disabled=$('#publishBtn').disabled=true;msg('#formMsg','جارٍ الحفظ…');
 try{
   let productId=state.editing;
   if(productId){const {error}=await sb.from('products').update(productRow).eq('id',productId);if(error)throw error}
   else{productRow.slug=(slugify(name)||'product')+'-'+Date.now().toString(36).slice(-6);productRow.need_tags=[];productRow.situations=[];const {data,error}=await sb.from('products').insert(productRow).select('id').single();if(error)throw error;productId=data.id}
   const existing=state.products.find(p=>p.id===productId)?.product_variants?.[0];
   const variant={product_id:productId,sku:$('#sku').value.trim()||existing?.sku||('MK-'+Date.now().toString(36).toUpperCase()),title:$('#condition').value,price,stock_quantity:stock,low_stock_threshold:1,barcode:$('#barcode').value.trim()||null,weight_grams:$('#weight').value?Number($('#weight').value):null,attributes:specs,is_active:true,updated_at:new Date().toISOString()};
   if(existing){const {error}=await sb.from('product_variants').update(variant).eq('id',existing.id);if(error)throw error}else{const {error}=await sb.from('product_variants').insert(variant);if(error)throw error}
   let offset=(state.products.find(p=>p.id===productId)?.product_images||[]).length;
   for(const f of state.files){const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg',path='products/'+productId+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+'.'+ext;const {error:up}=await sb.storage.from('product-images').upload(path,f,{contentType:f.type,cacheControl:'3600'});if(up)throw up;const {data:u}=sb.storage.from('product-images').getPublicUrl(path);const {error:ie}=await sb.from('product_images').insert({product_id:productId,url:u.publicUrl,alt_text:name,sort_order:offset++});if(ie)throw ie}
   msg('#formMsg',status==='active'?'تم حفظ المنتج ونشره.':'تم حفظ المنتج كمسودة.','ok');resetProductForm();await loadProducts();
 }catch(e){msg('#formMsg','تعذر الحفظ: '+(e.message||'خطأ'),'err')}finally{$('#saveDraftBtn').disabled=$('#publishBtn').disabled=false}
}
function stockModal(id){const p=state.products.find(x=>x.id===id),v=p?.product_variants?.[0];if(!p||!v)return;openModal('<div class="modal-title"><h2>تعديل المخزون</h2><button class="close" data-close>×</button></div><p>'+esc(p.name)+'</p><label>الكمية الفعلية<input id="modalStock" class="field" type="number" min="0" step="1" value="'+Number(v.stock_quantity||0)+'"></label><button id="saveStock" class="primary" style="width:100%;margin-top:12px">حفظ الكمية</button><div id="stockMsg" class="msg"></div>');$('#saveStock').onclick=async()=>{const qty=Math.max(0,Math.floor(Number($('#modalStock').value||0))),before=Number(v.stock_quantity||0);const {error}=await sb.from('product_variants').update({stock_quantity:qty,updated_at:new Date().toISOString()}).eq('id',v.id);if(error){msg('#stockMsg',error.message,'err');return}await sb.from('inventory_movements').insert({variant_id:v.id,quantity_before:before,quantity_after:qty,delta:qty-before,reason:'manual_adjustment',created_by:state.session.user.id});closeModal();await loadProducts()}}

async function loadOrders(){const {data,error}=await sb.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}).limit(100);if(error){$('#ordersList').innerHTML='<div class="danger">'+esc(error.message)+'</div>';return}state.orders=data||[];renderOrders()}
function renderOrders(){const f=$('#orderStatusFilter')?.value||'',list=state.orders.filter(o=>!f||o.status===f);$('#ordersList').innerHTML=list.length?list.map(o=>{const a=o.shipping_address||{},items=o.order_items||[];return '<article class="card-row"><div class="row-head"><div><div class="row-title">طلب MK-'+String(o.order_number).padStart(6,'0')+'</div><div class="meta">'+new Date(o.created_at).toLocaleString('ar-US')+'</div></div><div class="order-total">'+money(o.total)+'</div></div><div class="meta"><span class="badge '+(o.payment_status==='paid'?'good':'warn')+'">'+esc(o.payment_status)+'</span> <span class="badge">'+esc(o.status)+'</span> · '+esc(o.payment_method)+'</div><div class="meta">'+items.map(i=>esc(i.product_name)+' × '+i.quantity).join('، ')+'</div><div class="order-address meta">'+esc(a.recipient_name||'')+' · '+esc(a.phone||'')+'<br>'+esc([a.line1,a.line2,a.city,a.state,a.postal_code].filter(Boolean).join('، '))+'</div><div class="row-actions"><button data-order="'+o.id+'">إدارة الطلب</button></div></article>'}).join(''):'<div class="empty">لا توجد طلبات.</div>';$$('[data-order]',$('#ordersList')).forEach(b=>b.onclick=()=>orderModal(b.dataset.order))}
function orderModal(id){const o=state.orders.find(x=>x.id===id);if(!o)return;openModal('<div class="modal-title"><h2>MK-'+String(o.order_number).padStart(6,'0')+'</h2><button class="close" data-close>×</button></div><div class="stack"><label>حالة الطلب<select id="mOrderStatus" class="field">'+['pending','confirmed','processing','shipped','delivered','cancelled','refunded'].map(s=>'<option '+(o.status===s?'selected':'')+'>'+s+'</option>').join('')+'</select></label><label>شركة الشحن<input id="mCarrier" class="field" value="'+esc(o.shipping_carrier||'')+'" placeholder="USPS / UPS / FedEx"></label><label>رقم التتبع<input id="mTracking" class="field" value="'+esc(o.tracking_number||'')+'"></label><button id="saveOrder" class="primary">حفظ</button><div id="orderMsg" class="msg"></div></div>');$('#saveOrder').onclick=async()=>{const status=$('#mOrderStatus').value,row={status,shipping_carrier:$('#mCarrier').value.trim()||null,tracking_number:$('#mTracking').value.trim()||null,updated_at:new Date().toISOString()};if(status==='shipped'&&!o.shipped_at)row.shipped_at=new Date().toISOString();if(status==='delivered'&&!o.delivered_at)row.delivered_at=new Date().toISOString();const {error}=await sb.from('orders').update(row).eq('id',o.id);if(error){msg('#orderMsg',error.message,'err');return}closeModal();await loadOrders()}}

async function loadCustomers(){const [{data:profiles,error},{data:orders}]=await Promise.all([sb.from('profiles').select('id,full_name,phone,role,created_at').order('created_at',{ascending:false}),sb.from('orders').select('user_id,total,payment_status')]);if(error){$('#customersList').innerHTML='<div class="danger">'+esc(error.message)+'</div>';return}const stats={};(orders||[]).forEach(o=>{if(!o.user_id)return;stats[o.user_id]??={count:0,paid:0};stats[o.user_id].count++;if(o.payment_status==='paid')stats[o.user_id].paid+=Number(o.total||0)});state.customers=profiles||[];$('#customersList').innerHTML=state.customers.filter(p=>p.role!=='admin').length?state.customers.filter(p=>p.role!=='admin').map(p=>'<article class="card-row"><div class="row-head"><div><div class="row-title">'+esc(p.full_name||'عميل')+'</div><div class="meta">'+esc(p.phone||'لا يوجد هاتف')+'</div></div><span class="badge">'+(stats[p.id]?.count||0)+' طلب</span></div><div class="meta">إجمالي مدفوع: '+money(stats[p.id]?.paid||0)+'</div></article>').join(''):'<div class="empty">لا يوجد عملاء مسجلون بعد.</div>'}

async function loadCoupons(){const {data,error}=await sb.from('coupons').select('*').order('created_at',{ascending:false});if(error){$('#couponsList').innerHTML='<div class="danger">'+esc(error.message)+'</div>';return}state.coupons=data||[];$('#couponsList').innerHTML=state.coupons.length?state.coupons.map(c=>'<article class="card-row"><div class="row-head"><div><div class="row-title">'+esc(c.code)+'</div><div class="meta">'+(c.discount_type==='percent'?c.discount_value+'%':money(c.discount_value))+' · حد أدنى '+money(c.minimum_order)+'</div></div><span class="badge '+(c.is_active?'good':'bad')+'">'+(c.is_active?'فعال':'موقوف')+'</span></div><div class="row-actions"><button data-coupon="'+c.id+'">'+(c.is_active?'إيقاف':'تفعيل')+'</button></div></article>').join(''):'<div class="empty">لا توجد أكواد خصم.</div>';$$('[data-coupon]',$('#couponsList')).forEach(b=>b.onclick=()=>toggleCoupon(b.dataset.coupon))}
async function createCoupon(){const code=$('#couponCode').value.trim().toUpperCase(),type=$('#couponType').value,val=Number($('#couponValue').value),min=Number($('#couponMin').value||0);if(!code||!Number.isFinite(val)||val<=0){msg('#couponMsg','اكتب كودًا وقيمة صحيحة.','err');return}const {error}=await sb.from('coupons').insert({code,discount_type:type,discount_value:val,minimum_order:min,is_active:true,used_count:0});if(error){msg('#couponMsg',error.message,'err');return}msg('#couponMsg','تم إنشاء الكود.','ok');$('#couponCode').value='';$('#couponValue').value='';await loadCoupons()}
async function toggleCoupon(id){const c=state.coupons.find(x=>x.id===id);if(!c)return;const {error}=await sb.from('coupons').update({is_active:!c.is_active}).eq('id',id);if(error)alert(error.message);else await loadCoupons()}

async function loadSettings(){const {data,error}=await sb.from('store_settings').select('*').eq('id',1).single();if(error)return;state.settings=data;$('#storeName').value=data.store_name||'';$('#shippingFee').value=data.standard_shipping_fee??0;$('#freeShipping').value=data.free_shipping_threshold??0;$('#supportEmail').value=data.support_email||'';$('#checkoutEnabled').checked=!!data.checkout_enabled;$('#stripeEnabled').checked=!!data.stripe_online_enabled;$('#codEnabled').checked=!!data.cash_on_delivery_enabled}
async function saveSettings(){const row={store_name:$('#storeName').value.trim()||'MAKHRAJ',standard_shipping_fee:Number($('#shippingFee').value||0),free_shipping_threshold:Number($('#freeShipping').value||0),support_email:$('#supportEmail').value.trim()||null,checkout_enabled:$('#checkoutEnabled').checked,stripe_online_enabled:$('#stripeEnabled').checked,cash_on_delivery_enabled:$('#codEnabled').checked,updated_at:new Date().toISOString()};const {error}=await sb.from('store_settings').update(row).eq('id',1);if(error){msg('#settingsMsg',error.message,'err');return}msg('#settingsMsg','تم حفظ الإعدادات.','ok');await loadSettings();await loadOverview()}


async function loadSupport(){
 const box=$('#supportInbox'); if(!box)return;
 box.innerHTML='<div class="muted">جارٍ تحميل المحادثات…</div>';
 const {data,error}=await sb.from('support_tickets')
   .select('id,user_id,order_id,subject,status,priority,created_at,updated_at')
   .order('updated_at',{ascending:false})
   .limit(100);
 if(error){box.innerHTML='<div class="danger">'+esc(error.message)+'</div>';return}
 const tickets=data||[];
 const ids=[...new Set(tickets.map(t=>t.user_id).filter(Boolean))];
 let profileMap={};
 if(ids.length){
   const {data:profiles}=await sb.from('profiles').select('id,full_name,phone').in('id',ids);
   profileMap=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
 }
 state.tickets=tickets.map(t=>({...t,customer:profileMap[t.user_id]||null}));
 box.innerHTML=state.tickets.length?state.tickets.map(t=>{
   const name=t.customer?.full_name||'عميل';
   const badge=t.status==='waiting_customer'?'<span class="badge warn">بانتظار العميل</span>':t.status==='resolved'||t.status==='closed'?'<span class="badge good">'+esc(t.status)+'</span>':'<span class="badge">'+esc(t.status)+'</span>';
   return '<button class="support-row card-row" data-support="'+t.id+'"><div class="row-head"><div><div class="row-title">'+esc(t.subject)+'</div><div class="meta">'+esc(name)+' · '+new Date(t.updated_at).toLocaleString()+'</div></div>'+badge+'</div></button>';
 }).join(''):'<div class="empty">لا توجد محادثات دعم بعد.</div>';
 $$('[data-support]',box).forEach(btn=>btn.onclick=()=>openAdminTicket(btn.dataset.support));
}

async function openAdminTicket(ticketId){
 state.activeTicket=ticketId;
 const [{data:ticket,error:tErr},{data:messages,error:mErr}]=await Promise.all([
   sb.from('support_tickets').select('*').eq('id',ticketId).single(),
   sb.from('support_messages').select('id,sender_user_id,message,is_staff,source_language,created_at').eq('ticket_id',ticketId).order('created_at')
 ]);
 if(tErr||mErr){alert('تعذر فتح المحادثة');return}
 const {data:customer}=await sb.from('profiles').select('id,full_name,phone').eq('id',ticket.user_id).maybeSingle();
 const target=window.MakhrajI18n?.language||'ar';
 openModal('<div class="modal-title"><div><div class="eyebrow">SUPPORT</div><h2>'+esc(ticket.subject)+'</h2><div class="meta">'+esc(customer?.full_name||'عميل')+' · ترجمة تلقائية '+esc(target.toUpperCase())+'</div></div><button class="close" data-close>×</button></div>'+
   '<div class="support-thread">'+(messages||[]).map(m=>'<div class="chat-bubble '+(m.is_staff?'staff':'customer')+'"><div class="meta">'+(m.is_staff?'دعم مَخْرَج':'العميل')+' · '+new Date(m.created_at).toLocaleString()+'</div><div class="chat-original">'+esc(m.message)+'</div><div data-admin-translation="'+m.id+'" class="chat-translation"></div></div>').join('')+'</div>'+
   '<div class="stack support-compose"><label>حالة التذكرة<select id="ticketStatusAdmin" class="field">'+['open','in_progress','waiting_customer','resolved','closed'].map(s=>'<option value="'+s+'" '+(ticket.status===s?'selected':'')+'>'+s+'</option>').join('')+'</select></label>'+
   '<textarea id="adminReply" class="field" rows="3" placeholder="رد على العميل"></textarea><div class="two"><button id="saveTicketStatus" class="secondary">حفظ الحالة</button><button id="sendAdminReply" class="primary">إرسال الرد</button></div><div id="adminReplyMsg" class="msg"></div></div>');
 (messages||[]).forEach(m=>translateAdminMessage(m,target));
 $('#saveTicketStatus').onclick=async()=>{
   const {error}=await sb.from('support_tickets').update({status:$('#ticketStatusAdmin').value,updated_at:new Date().toISOString()}).eq('id',ticketId);
   if(error){msg('#adminReplyMsg',error.message,'err');return}
   msg('#adminReplyMsg','تم حفظ الحالة.','ok');await loadSupport();
 };
 $('#sendAdminReply').onclick=async()=>{
   const text=$('#adminReply').value.trim(); if(!text){msg('#adminReplyMsg','اكتب ردًا أولًا.','err');return}
   const {error}=await sb.from('support_messages').insert({
     ticket_id:ticketId,
     sender_user_id:state.session.user.id,
     message:text,
     is_staff:true,
     source_language:window.MakhrajI18n?.language||'auto'
   });
   if(error){msg('#adminReplyMsg',error.message,'err');return}
   await loadSupport(); openAdminTicket(ticketId);
 };
}

async function translateAdminMessage(message,target){
 const box=$('[data-admin-translation="'+message.id+'"]',$('#modalCard')); if(!box)return;
 if(message.source_language===target){box.innerHTML='';return}
 box.innerHTML='<div class="translation-label">جارٍ الترجمة…</div>';
 const {data,error}=await sb.functions.invoke('translate-message',{body:{message_id:message.id,target_language:target}});
 if(!box.isConnected)return;
 if(error||!data?.translated_text){box.innerHTML='<div class="translation-error">تعذر الترجمة الآن</div>';return}
 if(String(data.translated_text).trim()===String(message.message).trim()){box.innerHTML='';return}
 box.innerHTML='<div class="translation-label">الترجمة</div><div>'+esc(data.translated_text)+'</div>';
 window.MakhrajI18n?.apply(box);
}

init().catch(e=>{console.error(e);showGate('<div class="danger">تعذر تشغيل لوحة الإدارة.</div>')});
})();