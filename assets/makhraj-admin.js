(() => {
  'use strict';
  const cfg=window.MAKHRAJ_CONFIG;
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:cfg.currency}).format(Number(n||0));
  const slugify=s=>String(s||'').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
  const state={session:null,profile:null,products:[],categories:[],orders:[],coupons:[],inventory:[]};
  const gate=$('#authGate'), app=$('#adminApp'), modal=$('#modal'), modalBox=$('#modalBox');

  function msg(el,text,type=''){el.textContent=text;el.className='tiny '+type}
  function closeModal(){modal.classList.remove('open');modalBox.innerHTML=''}
  function openModal(html){modalBox.innerHTML=html;modal.classList.add('open')}
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});

  async function boot(){
    bind();
    const {data:{session}}=await sb.auth.getSession();
    state.session=session;
    if(session) await authorize(); else showGate();
    sb.auth.onAuthStateChange(async(_e,s)=>{state.session=s;if(s)await authorize();else showGate()});
  }
  function bind(){
    $('#loginBtn').onclick=login;
    $('#signupAdminBtn').onclick=signupInitial;
    $('#logoutBtn').onclick=()=>sb.auth.signOut();
    $('#newProductBtn').onclick=()=>productModal();
    $('#newCategoryBtn').onclick=()=>categoryModal();
    $('#newCouponBtn').onclick=()=>couponModal();
    $('#refreshOrdersBtn').onclick=loadOrders;
    $$('.side button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  }
  function showGate(){
    gate.classList.remove('hidden');app.classList.add('hidden');
    state.profile=null;
  }
  async function login(){
    const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;
    msg($('#loginMsg'),'جارٍ تسجيل الدخول…');
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error)msg($('#loginMsg'),error.message,'bad');
  }
  async function signupInitial(){
    const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;
    if(!email||password.length<6){msg($('#loginMsg'),'اكتب بريدًا صحيحًا وكلمة مرور 6 أحرف على الأقل.','bad');return}
    msg($('#loginMsg'),'جارٍ إنشاء الحساب…');
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:'مالك مَخْرَج'}}});
    if(error){msg($('#loginMsg'),error.message,'bad');return}
    if(!data.session){msg($('#loginMsg'),'تم إنشاء الحساب. أكّد البريد الإلكتروني أولًا ثم سجّل الدخول.','ok');return}
    state.session=data.session;await authorize();
  }
  async function authorize(){
    const {data,error}=await sb.from('profiles').select('id,full_name,phone,role').eq('id',state.session.user.id).maybeSingle();
    if(error){showGate();msg($('#loginMsg'),'تعذر التحقق من الصلاحية: '+error.message,'bad');return}
    state.profile=data;
    if(data?.role!=='admin'){
      showGate();
      msg($('#loginMsg'),'تم تسجيل الحساب بنجاح، لكنه ليس مديرًا بعد. بريد الحساب: '+state.session.user.email,'bad');
      return;
    }
    gate.classList.add('hidden');app.classList.remove('hidden');
    $('#adminIdentity').textContent=(data.full_name||'مدير')+' · '+state.session.user.email;
    await refreshAll();
  }

  async function refreshAll(){
    await Promise.all([loadCategories(),loadProducts(),loadOrders(),loadInventory(),loadCoupons()]);
    await loadStats();
  }
  function showTab(tab){
    ['products','orders','categories','inventory','coupons'].forEach(t=>$('#'+t+'Tab').classList.toggle('hidden',t!==tab));
    $$('.side button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  }

  async function loadStats(){
    const [pc,oc,low,paid]=await Promise.all([
      sb.from('products').select('id',{count:'exact',head:true}),
      sb.from('orders').select('id',{count:'exact',head:true}),
      sb.from('product_variants').select('id,stock_quantity,low_stock_threshold'),
      sb.from('orders').select('total').eq('payment_status','paid')
    ]);
    $('#statProducts').textContent=pc.count??0;
    $('#statOrders').textContent=oc.count??0;
    $('#statLow').textContent=(low.data||[]).filter(x=>x.stock_quantity<=x.low_stock_threshold).length;
    $('#statRevenue').textContent=money((paid.data||[]).reduce((s,x)=>s+Number(x.total||0),0));
  }

  async function loadCategories(){
    const {data,error}=await sb.from('categories').select('*').order('sort_order').order('name');
    if(error)return;
    state.categories=data||[];renderCategories();
  }
  function renderCategories(){
    const el=$('#categoriesTable');
    if(!state.categories.length){el.innerHTML='<div class="empty">لا توجد أقسام بعد.</div>';return}
    el.innerHTML='<table class="table"><thead><tr><th>القسم</th><th>Slug</th><th>الترتيب</th><th>الحالة</th><th></th></tr></thead><tbody>'+
      state.categories.map(c=>'<tr><td><b>'+esc(c.name)+'</b><div class="tiny">'+esc(c.description||'')+'</div></td><td>'+esc(c.slug)+'</td><td>'+c.sort_order+'</td><td><span class="status">'+(c.is_active?'نشط':'مخفي')+'</span></td><td><button class="btn" data-edit-cat="'+c.id+'">تعديل</button></td></tr>').join('')+'</tbody></table>';
    $$('[data-edit-cat]',el).forEach(b=>b.onclick=()=>categoryModal(state.categories.find(c=>c.id===b.dataset.editCat)));
  }
  function categoryModal(c=null){
    openModal('<div class="sectionhead"><div><h2>'+(c?'تعديل القسم':'قسم جديد')+'</h2><div class="tiny">ينعكس على تصنيفات المتجر</div></div><button class="btn" data-close>إغلاق</button></div><div class="form"><input class="field" id="catName" placeholder="اسم القسم" value="'+esc(c?.name||'')+'"><input class="field" id="catSlug" placeholder="slug" value="'+esc(c?.slug||'')+'"><textarea class="field" id="catDesc" rows="3" placeholder="وصف مختصر">'+esc(c?.description||'')+'</textarea><input class="field" id="catSort" type="number" placeholder="الترتيب" value="'+(c?.sort_order??0)+'"><label><input type="checkbox" id="catActive" '+(c?.is_active!==false?'checked':'')+'> نشط</label><button class="btn primary" id="saveCat">حفظ</button><div id="catMsg" class="tiny"></div></div>');
    $('[data-close]',modalBox).onclick=closeModal;
    $('#catName',modalBox).oninput=()=>{if(!c)$('#catSlug',modalBox).value=slugify($('#catName',modalBox).value)};
    $('#saveCat',modalBox).onclick=async()=>{
      const row={name:$('#catName',modalBox).value.trim(),slug:slugify($('#catSlug',modalBox).value||$('#catName',modalBox).value),description:$('#catDesc',modalBox).value.trim()||null,sort_order:Number($('#catSort',modalBox).value||0),is_active:$('#catActive',modalBox).checked};
      if(!row.name||!row.slug){msg($('#catMsg',modalBox),'الاسم مطلوب.','bad');return}
      const q=c?sb.from('categories').update(row).eq('id',c.id):sb.from('categories').insert(row);
      const {error}=await q;if(error){msg($('#catMsg',modalBox),error.message,'bad');return}
      closeModal();await loadCategories();
    };
  }

  async function loadProducts(){
    const {data,error}=await sb.from('products').select('*,categories(name),product_images(*),product_variants(*),product_costs(cost_price)').order('created_at',{ascending:false});
    if(error)return;
    state.products=(data||[]).map(p=>({...p,product_images:[...(p.product_images||[])].sort((a,b)=>a.sort_order-b.sort_order)}));
    renderProducts();
  }
  function renderProducts(){
    const el=$('#productsTable');
    if(!state.products.length){el.innerHTML='<div class="empty">لا توجد منتجات بعد. اضغط «منتج جديد» وابدأ إضافة منتجاتك الحقيقية.</div>';return}
    el.innerHTML='<table class="table"><thead><tr><th>المنتج</th><th>القسم</th><th>السعر</th><th>المخزون</th><th>الحالة</th><th></th></tr></thead><tbody>'+
      state.products.map(p=>{const img=p.product_images?.[0]?.url,stock=(p.product_variants||[]).reduce((s,v)=>s+Number(v.stock_quantity||0),0);return '<tr><td><div class="row" style="justify-content:flex-start"><div class="thumb" '+(img?'style="background-image:url(\''+esc(img)+'\')"':'')+'></div><div><b>'+esc(p.name)+'</b><div class="tiny">'+esc(p.slug)+'</div></div></div></td><td>'+esc(p.categories?.name||'—')+'</td><td>'+money(p.base_price)+'</td><td>'+stock+'</td><td><span class="status">'+statusProduct(p.status)+'</span></td><td><button class="btn" data-edit-product="'+p.id+'">إدارة</button></td></tr>'}).join('')+'</tbody></table>';
    $$('[data-edit-product]',el).forEach(b=>b.onclick=()=>productModal(state.products.find(p=>p.id===b.dataset.editProduct)));
  }

  function variantRow(v={}){
    const a=v.attributes||{};
    return '<div class="variantrow card" data-variant-id="'+esc(v.id||'')+'"><input class="field vTitle" placeholder="اسم الخيار: أسود / M" value="'+esc(v.title||'افتراضي')+'"><input class="field vSku" placeholder="SKU" value="'+esc(v.sku||'')+'"><input class="field vPrice" type="number" step="0.01" placeholder="سعر خاص" value="'+esc(v.price??'')+'"><input class="field vStock" type="number" min="0" placeholder="المخزون" value="'+esc(v.stock_quantity??0)+'"><input class="field vColor" placeholder="اللون" value="'+esc(a.color||'')+'"><input class="field vSize" placeholder="المقاس" value="'+esc(a.size||'')+'"><button class="btn danger vRemove" type="button">حذف الخيار</button></div>';
  }
  function productModal(p=null){
    const currentCost=Array.isArray(p?.product_costs)?p.product_costs[0]?.cost_price:p?.product_costs?.cost_price;
    openModal('<div class="sectionhead"><div><h2>'+(p?'إدارة المنتج':'منتج جديد')+'</h2><div class="tiny">كل ما تحفظه هنا يصبح جزءًا من قاعدة مَخْرَج الحقيقية</div></div><button class="btn" data-close>إغلاق</button></div>'+
      '<div class="form"><div class="cols2"><input class="field" id="pName" placeholder="اسم المنتج" value="'+esc(p?.name||'')+'"><input class="field" id="pSlug" placeholder="slug" value="'+esc(p?.slug||'')+'"></div>'+
      '<textarea class="field" id="pDesc" rows="4" placeholder="وصف المنتج">'+esc(p?.description||'')+'</textarea>'+
      '<div class="cols3"><select class="field" id="pCategory"><option value="">بدون قسم</option>'+state.categories.map(c=>'<option value="'+c.id+'" '+(p?.category_id===c.id?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select><select class="field" id="pStatus"><option value="draft" '+(p?.status==='draft'?'selected':'')+'>مسودة</option><option value="active" '+(p?.status==='active'?'selected':'')+'>منشور</option><option value="archived" '+(p?.status==='archived'?'selected':'')+'>مؤرشف</option></select><label class="card"><input id="pFeatured" type="checkbox" '+(p?.featured?'checked':'')+'> منتج مميز</label></div>'+
      '<div class="cols3"><input class="field" id="pBase" type="number" step="0.01" min="0" placeholder="السعر الأساسي" value="'+esc(p?.base_price??'')+'"><input class="field" id="pCompare" type="number" step="0.01" min="0" placeholder="السعر قبل الخصم" value="'+esc(p?.compare_at_price??'')+'"><input class="field" id="pCost" type="number" step="0.01" min="0" placeholder="تكلفة الشراء (إدارية)" value="'+esc(currentCost??'')+'"></div>'+
      '<div class="row"><div><b>الخيارات والمخزون</b><div class="tiny">لكل لون/مقاس SKU ومخزون مستقل</div></div><button class="btn" id="addVariant" type="button">+ خيار</button></div><div id="variantRows" class="variants">'+((p?.product_variants?.length?p.product_variants:[{}]).map(variantRow).join(''))+'</div>'+
      '<div class="row"><div><b>صور المنتج</b><div class="tiny">JPG/PNG/WebP/AVIF حتى 5MB</div></div></div><div id="existingImages" class="images">'+(p?.product_images||[]).map(i=>'<div class="imgcard" data-image="'+i.id+'"><div class="thumb" style="background-image:url(\''+esc(i.url)+'\')"></div><button type="button" data-del-img="'+i.id+'">×</button></div>').join('')+'</div><input class="field" id="pImages" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple>'+
      '<button class="btn primary" id="saveProduct">'+(p?'حفظ التعديلات':'إنشاء المنتج')+'</button>'+(p?'<button class="btn danger" id="archiveProduct" type="button">أرشفة المنتج</button>':'')+'<div id="pMsg" class="tiny"></div></div>');
    $('[data-close]',modalBox).onclick=closeModal;
    $('#pName',modalBox).oninput=()=>{if(!p)$('#pSlug',modalBox).value=slugify($('#pName',modalBox).value)};
    $('#addVariant',modalBox).onclick=()=>{$('#variantRows',modalBox).insertAdjacentHTML('beforeend',variantRow({title:'خيار جديد',stock_quantity:0}));bindVariantRemove()};
    function bindVariantRemove(){
      $$('.vRemove',modalBox).forEach(btn=>btn.onclick=async()=>{
        const row=btn.closest('[data-variant-id]'),id=row.dataset.variantId;
        if(id){
          if(!confirm('حذف هذا الخيار نهائيًا؟'))return;
          const {error}=await sb.from('product_variants').delete().eq('id',id);
          if(error){alert(error.message);return}
        }
        row.remove();
      });
    }
    bindVariantRemove();
    $$('[data-del-img]',modalBox).forEach(btn=>btn.onclick=async()=>{
      if(!confirm('حذف الصورة؟'))return;
      const image=(p.product_images||[]).find(i=>i.id===btn.dataset.delImg);
      if(!image)return;
      const prefix=cfg.supabaseUrl+'/storage/v1/object/public/product-images/';
      const path=image.url.startsWith(prefix)?decodeURIComponent(image.url.slice(prefix.length)):null;
      if(path)await sb.storage.from('product-images').remove([path]);
      const {error}=await sb.from('product_images').delete().eq('id',image.id);
      if(error){alert(error.message);return}
      btn.closest('.imgcard').remove();
    });
    $('#saveProduct',modalBox).onclick=()=>saveProduct(p);
    const arch=$('#archiveProduct',modalBox);if(arch)arch.onclick=async()=>{if(!confirm('أرشفة المنتج وإخفاؤه من المتجر؟'))return;await sb.from('products').update({status:'archived'}).eq('id',p.id);closeModal();await loadProducts();await loadStats()};
  }

  async function saveProduct(existing){
    const m=$('#pMsg',modalBox),btn=$('#saveProduct',modalBox);
    const base=Number($('#pBase',modalBox).value);
    const costValue=$('#pCost',modalBox).value?Number($('#pCost',modalBox).value):null;
    const row={name:$('#pName',modalBox).value.trim(),slug:slugify($('#pSlug',modalBox).value||$('#pName',modalBox).value),description:$('#pDesc',modalBox).value.trim()||null,category_id:$('#pCategory',modalBox).value||null,status:$('#pStatus',modalBox).value,base_price:base,compare_at_price:$('#pCompare',modalBox).value?Number($('#pCompare',modalBox).value):null,featured:$('#pFeatured',modalBox).checked};
    if(!row.name||!row.slug||!Number.isFinite(base)||base<0){msg(m,'الاسم والسعر الصحيح مطلوبان.','bad');return}
    if(row.compare_at_price!==null&&row.compare_at_price<row.base_price){msg(m,'السعر قبل الخصم يجب ألا يكون أقل من السعر الحالي.','bad');return}
    btn.disabled=true;btn.textContent='جارٍ الحفظ…';
    let productId=existing?.id;
    try{
      if(existing){
        const {error}=await sb.from('products').update(row).eq('id',existing.id);if(error)throw error;
      }else{
        const {data,error}=await sb.from('products').insert(row).select('id').single();if(error)throw error;productId=data.id;
      }
      const {error:costError}=await sb.from('product_costs').upsert({product_id:productId,cost_price:costValue},{onConflict:'product_id'});if(costError)throw costError;
      const variantEls=$$('#variantRows [data-variant-id]',modalBox);
      if(!variantEls.length)throw new Error('أضف خيارًا واحدًا على الأقل.');
      for(const vEl of variantEls){
        const title=$('.vTitle',vEl).value.trim()||'افتراضي',sku=$('.vSku',vEl).value.trim();
        const stock=Number($('.vStock',vEl).value||0),price=$('.vPrice',vEl).value?Number($('.vPrice',vEl).value):null;
        const color=$('.vColor',vEl).value.trim(),size=$('.vSize',vEl).value.trim();
        if(!sku)throw new Error('كل خيار يحتاج SKU فريدًا.');
        const vr={product_id:productId,title,sku,stock_quantity:stock,price,attributes:{...(color?{color}:{}),...(size?{size}:{})},is_active:true};
        const id=vEl.dataset.variantId;
        const {error}=id?await sb.from('product_variants').update(vr).eq('id',id):await sb.from('product_variants').insert(vr);
        if(error)throw error;
      }
      const files=[...$('#pImages',modalBox).files];
      for(let i=0;i<files.length;i++){
        const f=files[i],ext=(f.name.split('.').pop()||'jpg').toLowerCase(),path=productId+'/'+Date.now()+'-'+i+'.'+ext;
        const {error:upErr}=await sb.storage.from('product-images').upload(path,f,{upsert:false,contentType:f.type});if(upErr)throw upErr;
        const {data:urlData}=sb.storage.from('product-images').getPublicUrl(path);
        const {error:imErr}=await sb.from('product_images').insert({product_id:productId,url:urlData.publicUrl,alt_text:row.name,sort_order:(existing?.product_images?.length||0)+i});if(imErr)throw imErr;
      }
      closeModal();await Promise.all([loadProducts(),loadInventory(),loadStats()]);
    }catch(e){console.error(e);msg(m,e.message||'تعذر حفظ المنتج.','bad');btn.disabled=false;btn.textContent=existing?'حفظ التعديلات':'إنشاء المنتج'}
  }

  async function loadOrders(){
    const {data,error}=await sb.from('orders').select('id,order_number,status,payment_status,total,created_at,shipping_address,notes,order_items(product_name,variant_title,sku,quantity,unit_price,line_total)').order('created_at',{ascending:false}).limit(200);
    if(error)return;
    state.orders=data||[];renderOrders();
  }
  function renderOrders(){
    const el=$('#ordersTable');
    if(!state.orders.length){el.innerHTML='<div class="empty">لا توجد طلبات بعد.</div>';return}
    el.innerHTML='<table class="table"><thead><tr><th>الطلب</th><th>العميل</th><th>الحالة</th><th>الدفع</th><th>الإجمالي</th><th></th></tr></thead><tbody>'+
      state.orders.map(o=>'<tr><td><b>MK-'+String(o.order_number).padStart(6,'0')+'</b><div class="tiny">'+new Date(o.created_at).toLocaleString('ar-US')+'</div></td><td>'+esc(o.shipping_address?.recipient_name||'عميل')+'<div class="tiny">'+esc(o.shipping_address?.phone||'')+'</div></td><td><span class="status">'+orderStatus(o.status)+'</span></td><td><span class="status">'+paymentStatus(o.payment_status)+'</span></td><td class="price">'+money(o.total)+'</td><td><button class="btn" data-order="'+o.id+'">فتح</button></td></tr>').join('')+'</tbody></table>';
    $$('[data-order]',el).forEach(b=>b.onclick=()=>orderModal(state.orders.find(o=>o.id===b.dataset.order)));
  }
  function orderModal(o){
    openModal('<div class="sectionhead"><div><h2>MK-'+String(o.order_number).padStart(6,'0')+'</h2><div class="tiny">'+new Date(o.created_at).toLocaleString('ar-US')+'</div></div><button class="btn" data-close>إغلاق</button></div>'+
      '<div class="cols2"><div class="card"><b>حالة الطلب</b><select class="field" id="oStatus"><option value="pending">مستلم</option><option value="confirmed">مؤكد</option><option value="processing">قيد التجهيز</option><option value="shipped">تم الشحن</option><option value="delivered">تم التسليم</option><option value="cancelled">ملغى</option><option value="refunded">مسترد</option></select></div><div class="card"><b>حالة الدفع</b><select class="field" id="oPayment"><option value="unpaid">غير مدفوع</option><option value="authorized">مصرح</option><option value="paid">مدفوع</option><option value="partially_refunded">استرداد جزئي</option><option value="refunded">مسترد</option><option value="failed">فشل</option></select></div></div>'+
      '<div class="card" style="margin-top:10px"><b>التوصيل</b><div class="muted">'+esc(o.shipping_address?.recipient_name||'')+' · '+esc(o.shipping_address?.phone||'')+'<br>'+esc(o.shipping_address?.line1||'')+' '+esc(o.shipping_address?.line2||'')+'<br>'+esc(o.shipping_address?.city||'')+' '+esc(o.shipping_address?.state||'')+' '+esc(o.shipping_address?.postal_code||'')+'</div></div>'+
      '<div class="tablewrap" style="margin-top:10px"><table class="table"><thead><tr><th>المنتج</th><th>SKU</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>'+(o.order_items||[]).map(i=>'<tr><td>'+esc(i.product_name)+'<div class="tiny">'+esc(i.variant_title||'')+'</div></td><td>'+esc(i.sku||'')+'</td><td>'+i.quantity+'</td><td>'+money(i.line_total)+'</td></tr>').join('')+'</tbody></table></div><div class="row" style="margin-top:12px"><b>الإجمالي</b><b style="font-size:22px;color:var(--gold)">'+money(o.total)+'</b></div><button class="btn primary" id="saveOrder" style="margin-top:12px">حفظ الحالة</button><div id="oMsg" class="tiny"></div>');
    $('[data-close]',modalBox).onclick=closeModal;$('#oStatus',modalBox).value=o.status;$('#oPayment',modalBox).value=o.payment_status;
    $('#saveOrder',modalBox).onclick=async()=>{const {error}=await sb.from('orders').update({status:$('#oStatus',modalBox).value,payment_status:$('#oPayment',modalBox).value}).eq('id',o.id);if(error){msg($('#oMsg',modalBox),error.message,'bad');return}closeModal();await Promise.all([loadOrders(),loadStats()])};
  }

  async function loadInventory(){
    const {data,error}=await sb.from('product_variants').select('id,sku,title,stock_quantity,low_stock_threshold,is_active,products(name,status)').order('stock_quantity');
    if(error)return;state.inventory=data||[];renderInventory();
  }
  function renderInventory(){
    const el=$('#inventoryTable');
    if(!state.inventory.length){el.innerHTML='<div class="empty">لا يوجد مخزون بعد.</div>';return}
    el.innerHTML='<table class="table"><thead><tr><th>المنتج</th><th>الخيار</th><th>SKU</th><th>المخزون</th><th>التنبيه</th><th></th></tr></thead><tbody>'+
      state.inventory.map(v=>'<tr><td>'+esc(v.products?.name||'')+'</td><td>'+esc(v.title)+'</td><td>'+esc(v.sku)+'</td><td><input class="field" style="width:100px" type="number" min="0" value="'+v.stock_quantity+'" data-stock="'+v.id+'"></td><td>'+(v.stock_quantity<=v.low_stock_threshold?'<span class="bad">منخفض</span>':'<span class="ok">جيد</span>')+'</td><td><button class="btn" data-save-stock="'+v.id+'">حفظ</button></td></tr>').join('')+'</tbody></table>';
    $$('[data-save-stock]',el).forEach(b=>b.onclick=async()=>{const input=$('[data-stock="'+b.dataset.saveStock+'"]',el),qty=Number(input.value);const {error}=await sb.from('product_variants').update({stock_quantity:qty}).eq('id',b.dataset.saveStock);if(error)alert(error.message);else await Promise.all([loadInventory(),loadProducts(),loadStats()])});
  }

  async function loadCoupons(){
    const {data,error}=await sb.from('coupons').select('*').order('created_at',{ascending:false});if(error)return;state.coupons=data||[];renderCoupons();
  }
  function renderCoupons(){
    const el=$('#couponsTable');
    if(!state.coupons.length){el.innerHTML='<div class="empty">لا توجد كوبونات.</div>';return}
    el.innerHTML='<table class="table"><thead><tr><th>الكود</th><th>الخصم</th><th>الحد الأدنى</th><th>الاستخدام</th><th>الحالة</th><th></th></tr></thead><tbody>'+
      state.coupons.map(c=>'<tr><td><b>'+esc(c.code)+'</b></td><td>'+(c.discount_type==='percent'?c.discount_value+'%':money(c.discount_value))+'</td><td>'+money(c.minimum_order)+'</td><td>'+c.used_count+(c.usage_limit?' / '+c.usage_limit:'')+'</td><td><span class="status">'+(c.is_active?'نشط':'متوقف')+'</span></td><td><button class="btn" data-edit-coupon="'+c.id+'">تعديل</button></td></tr>').join('')+'</tbody></table>';
    $$('[data-edit-coupon]',el).forEach(b=>b.onclick=()=>couponModal(state.coupons.find(c=>c.id===b.dataset.editCoupon)));
  }
  function couponModal(c=null){
    openModal('<div class="sectionhead"><div><h2>'+(c?'تعديل الكوبون':'كوبون جديد')+'</h2></div><button class="btn" data-close>إغلاق</button></div><div class="form"><div class="cols2"><input class="field" id="cCode" placeholder="الكود" value="'+esc(c?.code||'')+'"><select class="field" id="cType"><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></select></div><div class="cols3"><input class="field" id="cValue" type="number" step="0.01" min="0" placeholder="قيمة الخصم" value="'+esc(c?.discount_value??'')+'"><input class="field" id="cMin" type="number" step="0.01" min="0" placeholder="الحد الأدنى" value="'+esc(c?.minimum_order??0)+'"><input class="field" id="cLimit" type="number" min="1" placeholder="حد الاستخدام" value="'+esc(c?.usage_limit??'')+'"></div><div class="cols2"><input class="field" id="cStart" type="datetime-local"><input class="field" id="cEnd" type="datetime-local"></div><label><input id="cActive" type="checkbox" '+(c?.is_active!==false?'checked':'')+'> نشط</label><button class="btn primary" id="saveCoupon">حفظ</button><div id="cMsg" class="tiny"></div></div>');
    $('[data-close]',modalBox).onclick=closeModal;$('#cType',modalBox).value=c?.discount_type||'percent';
    if(c?.starts_at)$('#cStart',modalBox).value=new Date(c.starts_at).toISOString().slice(0,16);if(c?.ends_at)$('#cEnd',modalBox).value=new Date(c.ends_at).toISOString().slice(0,16);
    $('#saveCoupon',modalBox).onclick=async()=>{const row={code:$('#cCode',modalBox).value.trim().toUpperCase(),discount_type:$('#cType',modalBox).value,discount_value:Number($('#cValue',modalBox).value),minimum_order:Number($('#cMin',modalBox).value||0),usage_limit:$('#cLimit',modalBox).value?Number($('#cLimit',modalBox).value):null,starts_at:$('#cStart',modalBox).value?new Date($('#cStart',modalBox).value).toISOString():null,ends_at:$('#cEnd',modalBox).value?new Date($('#cEnd',modalBox).value).toISOString():null,is_active:$('#cActive',modalBox).checked};if(!row.code||!row.discount_value){msg($('#cMsg',modalBox),'الكود والقيمة مطلوبان.','bad');return}const q=c?sb.from('coupons').update(row).eq('id',c.id):sb.from('coupons').insert(row);const {error}=await q;if(error){msg($('#cMsg',modalBox),error.message,'bad');return}closeModal();await loadCoupons()};
  }

  function statusProduct(s){return({draft:'مسودة',active:'منشور',archived:'مؤرشف'})[s]||s}
  function orderStatus(s){return({pending:'مستلم',confirmed:'مؤكد',processing:'قيد التجهيز',shipped:'تم الشحن',delivered:'تم التسليم',cancelled:'ملغى',refunded:'مسترد'})[s]||s}
  function paymentStatus(s){return({unpaid:'غير مدفوع',authorized:'مصرح',paid:'مدفوع',partially_refunded:'استرداد جزئي',refunded:'مسترد',failed:'فشل'})[s]||s}

  boot().catch(e=>{console.error(e);msg($('#loginMsg'),'تعذر تشغيل لوحة الإدارة.','bad')});
})();