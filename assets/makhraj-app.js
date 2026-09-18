(() => {
  'use strict';
  const cfg = window.MAKHRAJ_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:cfg.currency}).format(Number(n||0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slugify = s => String(s||'').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
  const safeJson = (k,d) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch { return d; } };

  const state = {
    products: [], categories: [], activeCategory: 'all', search: '',
    session: null, profile: null, selectedProduct: null, selectedVariant: null,
    cart: safeJson('makhraj-cart-prod', []),
    settings:{free_shipping_threshold:cfg.freeShippingThreshold,standard_shipping_fee:cfg.standardShipping,currency:cfg.currency},
    favs: new Set(safeJson('makhraj-favs-prod', []))
  };

  const els = {
    grid: $('#productGrid'), chips: $('#categoryChips'), count: $('#productCount'),
    cartCount: $('#cartCount'), search: $('#searchInput'), sheet: $('#sheet'), panel: $('#sheetPanel'),
    toast: $('#toast'), home: $('#homeView'), orders: $('#ordersView'), account: $('#accountView'),
    ordersList: $('#ordersList'), accountContent: $('#accountContent')
  };

  function toast(msg){
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(()=>els.toast.classList.remove('show'),1800);
    if(navigator.vibrate) navigator.vibrate(15);
  }
  function saveLocal(){
    localStorage.setItem('makhraj-cart-prod', JSON.stringify(state.cart));
    localStorage.setItem('makhraj-favs-prod', JSON.stringify([...state.favs]));
    els.cartCount.textContent = state.cart.reduce((s,x)=>s+x.qty,0);
  }
  function openSheet(html){
    els.panel.innerHTML = html;
    els.sheet.classList.add('open');
    els.sheet.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function closeSheet(){
    els.sheet.classList.remove('open');
    els.sheet.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    state.selectedProduct = null;
    state.selectedVariant = null;
  }
  els.sheet.addEventListener('click',e=>{ if(e.target===els.sheet) closeSheet(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSheet(); });

  async function init(){
    saveLocal();
    const { data:{ session } } = await sb.auth.getSession();
    state.session = session;
    if(session) await afterAuth();
    await Promise.all([loadSettings(), loadCategories(), loadProducts()]);
    bindStatic();
    render();
  }

  function bindStatic(){
    $('#cartTopBtn').onclick = openCart;
    $('#refreshBtn').onclick = async()=>{ await Promise.all([loadCategories(),loadProducts()]); render(); toast('تم تحديث المتجر'); };
    $('#smartPickBtn').onclick = openSmart;
    $('#accountHeroBtn').onclick = ()=>showView('account');
    els.search.addEventListener('input',()=>{ state.search=els.search.value.trim().toLowerCase(); renderProducts(); });
    $$('.bottom button').forEach(b=>{
      b.onclick=()=>{
        if(b.dataset.view) showView(b.dataset.view);
        if(b.dataset.action==='focus-search'){ showView('home'); setTimeout(()=>els.search.focus(),80); }
        if(b.dataset.action==='smart') openSmart();
      };
    });
    sb.auth.onAuthStateChange(async (_event,session)=>{
      state.session=session;
      if(session) await afterAuth(); else { state.profile=null; state.favs=new Set(safeJson('makhraj-favs-prod',[])); }
      renderAccount();
    });
  }

  async function afterAuth(){
    await loadProfile();
    await syncLocalFavorites();
    await loadFavorites();
  }
  async function loadProfile(){
    if(!state.session) return;
    const {data,error}=await sb.from('profiles').select('*').eq('id',state.session.user.id).maybeSingle();
    if(!error) state.profile=data;
  }

  async function loadSettings(){
    const {data}=await sb.from('store_settings').select('store_name,currency,free_shipping_threshold,standard_shipping_fee,support_email').eq('id',1).maybeSingle();
    if(data) state.settings=data;
  }
  async function loadCategories(){
    const {data,error}=await sb.from('categories').select('id,name,slug,sort_order').eq('is_active',true).order('sort_order');
    if(error){ console.error(error); state.categories=[]; return; }
    state.categories=data||[];
  }
  async function loadProducts(){
    els.grid.innerHTML='<div class="loading">جارٍ تحميل المنتجات الحقيقية…</div>';
    const {data,error}=await sb.from('products')
      .select('id,name,slug,description,status,base_price,compare_at_price,featured,category_id,categories(name,slug),product_images(id,url,alt_text,sort_order),product_variants(id,sku,title,price,stock_quantity,low_stock_threshold,attributes,is_active)')
      .eq('status','active').order('featured',{ascending:false}).order('created_at',{ascending:false});
    if(error){ console.error(error); els.grid.innerHTML='<div class="error">تعذر تحميل المنتجات. جرّب التحديث.</div>'; return; }
    state.products=(data||[]).map(p=>({
      ...p,
      product_images:[...(p.product_images||[])].sort((a,b)=>a.sort_order-b.sort_order),
      product_variants:(p.product_variants||[]).filter(v=>v.is_active)
    }));
  }

  function render(){
    renderCategories();
    renderProducts();
    renderAccount();
  }
  function renderCategories(){
    const all='<button class="chip '+(state.activeCategory==='all'?'on':'')+'" data-cat="all">الكل</button>';
    els.chips.innerHTML=all+state.categories.map(c=>'<button class="chip '+(state.activeCategory===c.id?'on':'')+'" data-cat="'+c.id+'">'+esc(c.name)+'</button>').join('');
    $$('.chip',els.chips).forEach(b=>b.onclick=()=>{state.activeCategory=b.dataset.cat;renderCategories();renderProducts();});
  }
  function filteredProducts(){
    return state.products.filter(p=>{
      const cat=state.activeCategory==='all'||p.category_id===state.activeCategory;
      const hay=(p.name+' '+(p.description||'')+' '+(p.categories?.name||'')).toLowerCase();
      return cat && (!state.search || hay.includes(state.search));
    });
  }
  function productImage(p){ return p.product_images?.[0]?.url || ''; }
  function minPrice(p){
    const prices=(p.product_variants||[]).filter(v=>v.stock_quantity>0).map(v=>Number(v.price ?? p.base_price));
    return prices.length?Math.min(...prices):Number(p.base_price);
  }
  function totalStock(p){ return (p.product_variants||[]).reduce((s,v)=>s+Number(v.stock_quantity||0),0); }
  function renderProducts(){
    const list=filteredProducts();
    els.count.textContent=list.length+' منتج';
    if(!list.length){
      els.grid.innerHTML='<div class="empty"><b>لا توجد منتجات مطابقة الآن.</b><br><span class="tiny">عندما تضيف منتجات من لوحة الإدارة ستظهر هنا مباشرة.</span></div>';
      return;
    }
    els.grid.innerHTML=list.map(p=>{
      const img=productImage(p),stock=totalStock(p),fav=state.favs.has(p.id);
      return '<article class="card product" data-product="'+p.id+'">'+
        '<button class="fav" data-fav="'+p.id+'" aria-label="المفضلة">'+(fav?'♥':'♡')+'</button>'+
        '<div class="pimg" '+(img?'style="background-image:url(\''+esc(img)+'\')"':'')+'>'+(img?'':'لا توجد صورة')+'</div>'+
        '<div class="pbody"><div class="tiny">'+esc(p.categories?.name||'مَخْرَج')+'</div><h3>'+esc(p.name)+'</h3>'+
        '<span class="price">'+money(minPrice(p))+'</span> '+(p.compare_at_price?'<span class="old">'+money(p.compare_at_price)+'</span>':'')+
        '<br><span class="badge">'+(stock>0?(stock<=3?'كمية محدودة':'متوفر'):'نفد المخزون')+'</span>'+
        '<button class="primary" style="width:100%;margin-top:10px" data-open="'+p.id+'" '+(stock<=0?'disabled':'')+'>عرض التفاصيل</button></div></article>';
    }).join('');
    $$('[data-open]',els.grid).forEach(b=>b.onclick=()=>openProduct(b.dataset.open));
    $$('[data-fav]',els.grid).forEach(b=>b.onclick=e=>{e.stopPropagation();toggleFavorite(b.dataset.fav);});
  }

  function openProduct(id){
    const p=state.products.find(x=>x.id===id); if(!p) return;
    state.selectedProduct=p;
    const variants=p.product_variants.filter(v=>v.stock_quantity>0);
    state.selectedVariant=variants[0]||p.product_variants[0]||null;
    const gallery=p.product_images.length
      ? '<div class="gallery">'+p.product_images.map(i=>'<img src="'+esc(i.url)+'" alt="'+esc(i.alt_text||p.name)+'" loading="lazy">').join('')+'</div>'
      : '<div class="gallery-placeholder">أضف صور المنتج من لوحة الإدارة</div>';
    openSheet('<div class="sheethead"><div><div class="tiny">'+esc(p.categories?.name||'')+'</div><h2 style="margin:3px 0">'+esc(p.name)+'</h2></div><button class="close" data-close>×</button></div>'+
      gallery+
      '<div class="line" style="margin-top:14px"><div><span class="price" id="detailPrice">'+money(state.selectedVariant?.price ?? p.base_price)+'</span> '+(p.compare_at_price?'<span class="old">'+money(p.compare_at_price)+'</span>':'')+'</div><button class="iconbtn" data-fav="'+p.id+'">'+(state.favs.has(p.id)?'♥':'♡')+'</button></div>'+
      '<p class="muted">'+esc(p.description||'سيظهر وصف المنتج هنا عند إضافته من لوحة الإدارة.')+'</p>'+
      '<div class="tiny">اختر الخيار المناسب</div><div class="variant-list" id="variantList">'+
      (variants.length?variants.map((v,i)=>'<button class="variant '+(i===0?'on':'')+'" data-variant="'+v.id+'">'+esc(v.title)+' · '+money(v.price??p.base_price)+' <span class="tiny">('+v.stock_quantity+')</span></button>').join(''):'<span class="danger">نفد المخزون</span>')+
      '</div><div class="line"><div class="qty"><button id="qtyMinus">−</button><b id="qtyValue">1</b><button id="qtyPlus">+</button></div><span class="tiny" id="stockText">'+(state.selectedVariant?'المتاح '+state.selectedVariant.stock_quantity:'')+'</span></div>'+
      '<button class="primary" id="addToCartBtn" style="width:100%;margin-top:16px" '+(!state.selectedVariant?'disabled':'')+'>أضف إلى السلة</button>');
    $('[data-close]',els.panel).onclick=closeSheet;
    $('[data-fav]',els.panel).onclick=()=>{toggleFavorite(p.id);openProduct(p.id);};
    let qty=1;
    const qv=$('#qtyValue',els.panel);
    $('#qtyMinus',els.panel).onclick=()=>{qty=Math.max(1,qty-1);qv.textContent=qty;};
    $('#qtyPlus',els.panel).onclick=()=>{qty=Math.min(Number(state.selectedVariant?.stock_quantity||1),qty+1);qv.textContent=qty;};
    $$('#variantList [data-variant]',els.panel).forEach(b=>b.onclick=()=>{
      state.selectedVariant=p.product_variants.find(v=>v.id===b.dataset.variant);
      qty=1;qv.textContent=1;
      $$('#variantList .variant',els.panel).forEach(x=>x.classList.remove('on'));b.classList.add('on');
      $('#detailPrice',els.panel).textContent=money(state.selectedVariant.price??p.base_price);
      $('#stockText',els.panel).textContent='المتاح '+state.selectedVariant.stock_quantity;
    });
    $('#addToCartBtn',els.panel).onclick=()=>addToCart(p,state.selectedVariant,qty);
  }

  function addToCart(p,v,qty){
    if(!v) return;
    const existing=state.cart.find(x=>x.variantId===v.id);
    const max=Number(v.stock_quantity||0);
    if(existing) existing.qty=Math.min(max,existing.qty+qty);
    else state.cart.push({variantId:v.id,productId:p.id,productName:p.name,variantTitle:v.title,price:Number(v.price??p.base_price),qty:Math.min(qty,max),image:productImage(p)});
    saveLocal();toast('أضيف إلى السلة');openCart();
  }
  function changeCart(variantId,delta){
    const x=state.cart.find(i=>i.variantId===variantId); if(!x)return;
    const p=state.products.find(p=>p.id===x.productId),v=p?.product_variants.find(v=>v.id===variantId);
    x.qty=Math.max(0,Math.min(Number(v?.stock_quantity||99),x.qty+delta));
    if(x.qty===0) state.cart=state.cart.filter(i=>i.variantId!==variantId);
    saveLocal();openCart();
  }
  function cartEstimate(){ return state.cart.reduce((s,x)=>s+Number(x.price)*x.qty,0); }
  function openCart(){
    const threshold=Number(state.settings.free_shipping_threshold??cfg.freeShippingThreshold),fee=Number(state.settings.standard_shipping_fee??cfg.standardShipping);const sub=cartEstimate(),ship=sub>=threshold||sub===0?0:fee,total=sub+ship;
    openSheet('<div class="sheethead"><h2 style="margin:0">سلة مَخْرَج</h2><button class="close" data-close>×</button></div>'+
      (state.cart.length?state.cart.map(x=>'<div class="cartrow"><div class="cartthumb" '+(x.image?'style="background-image:url(\''+esc(x.image)+'\')"':'')+'></div><div class="grow"><b>'+esc(x.productName)+'</b><div class="tiny">'+esc(x.variantTitle)+'</div><div class="price">'+money(x.price*x.qty)+'</div></div><div class="qty"><button data-dec="'+x.variantId+'">−</button><b>'+x.qty+'</b><button data-inc="'+x.variantId+'">+</button></div></div>').join('')+
      '<div class="summary"><div class="line"><span>المجموع التقديري</span><b>'+money(sub)+'</b></div><div class="line"><span>الشحن</span><b>'+(ship?money(ship):'مجاني')+'</b></div><div class="line total"><span>الإجمالي التقديري</span><span class="price">'+money(total)+'</span></div><div class="tiny">السعر النهائي والمخزون يعاد التحقق منهما على الخادم عند إنشاء الطلب.</div></div>'+
      '<button class="primary" id="checkoutBtn" style="width:100%">متابعة الطلب</button>'
      :'<div class="empty"><b>سلتك فارغة.</b><br>أضف منتجًا وسيظهر هنا مع خياره وكميته.</div>'));
    $('[data-close]',els.panel).onclick=closeSheet;
    $$('[data-dec]',els.panel).forEach(b=>b.onclick=()=>changeCart(b.dataset.dec,-1));
    $$('[data-inc]',els.panel).forEach(b=>b.onclick=()=>changeCart(b.dataset.inc,1));
    const c=$('#checkoutBtn',els.panel); if(c)c.onclick=checkout;
  }

  async function syncCartToServer(){
    if(!state.session) throw new Error('AUTH_REQUIRED');
    const {data:cartId,error:e1}=await sb.rpc('ensure_cart'); if(e1) throw e1;
    const {error:e2}=await sb.from('cart_items').delete().eq('cart_id',cartId); if(e2) throw e2;
    if(state.cart.length){
      const rows=state.cart.map(x=>({cart_id:cartId,variant_id:x.variantId,quantity:x.qty}));
      const {error:e3}=await sb.from('cart_items').insert(rows); if(e3) throw e3;
    }
    return cartId;
  }

  async function checkout(){
    if(!state.cart.length) return;
    if(!state.session){ openAuth('login','سجّل الدخول أولًا حتى نستطيع حفظ طلبك ومتابعته.'); return; }
    openSheet('<div class="sheethead"><h2 style="margin:0">بيانات التوصيل</h2><button class="close" data-close>×</button></div>'+
      '<div class="formgrid"><input class="field" id="coName" placeholder="اسم المستلم" value="'+esc(state.profile?.full_name||'')+'"><input class="field" id="coPhone" inputmode="tel" placeholder="رقم الهاتف" value="'+esc(state.profile?.phone||'')+'"><input class="field" id="coLine1" placeholder="العنوان"><input class="field" id="coLine2" placeholder="شقة / تفاصيل إضافية (اختياري)"><div class="line"><input class="field" id="coCity" placeholder="المدينة"><input class="field" id="coState" placeholder="الولاية"></div><input class="field" id="coZip" placeholder="ZIP Code" inputmode="numeric"><input class="field" id="coCoupon" placeholder="كود خصم (اختياري)"><textarea class="field" id="coNotes" rows="3" placeholder="ملاحظات للطلب (اختياري)"></textarea><label class="tiny"><input type="checkbox" id="saveAddress" checked> حفظ العنوان في حسابي</label><button class="primary" id="placeOrderBtn">إنشاء الطلب</button><div id="checkoutMsg" class="tiny"></div></div>');
    $('[data-close]',els.panel).onclick=closeSheet;
    $('#placeOrderBtn',els.panel).onclick=placeOrder;
  }

  async function placeOrder(){
    const btn=$('#placeOrderBtn',els.panel),msg=$('#checkoutMsg',els.panel);
    const address={
      recipient_name:$('#coName',els.panel).value.trim(), phone:$('#coPhone',els.panel).value.trim(),
      line1:$('#coLine1',els.panel).value.trim(), line2:$('#coLine2',els.panel).value.trim(),
      city:$('#coCity',els.panel).value.trim(), state:$('#coState',els.panel).value.trim(),
      postal_code:$('#coZip',els.panel).value.trim(), country:'US'
    };
    if(!address.recipient_name||!address.phone||!address.line1||!address.city){msg.textContent='أكمل الاسم والهاتف والعنوان والمدينة.';msg.className='danger';return;}
    btn.disabled=true;btn.textContent='جارٍ التحقق وإنشاء الطلب…';msg.textContent='';
    try{
      await syncCartToServer();
      if($('#saveAddress',els.panel).checked){
        await sb.from('addresses').insert({user_id:state.session.user.id,...address,label:'عنواني'});
      }
      const {data:orderId,error}=await sb.rpc('place_order',{p_shipping_address:address,p_notes:$('#coNotes',els.panel).value.trim()||null,p_coupon_code:$('#coCoupon',els.panel).value.trim()||null});
      if(error) throw error;
      const {data:order,error:e2}=await sb.from('orders').select('id,order_number,total,status,payment_status,created_at').eq('id',orderId).single();
      if(e2) throw e2;
      state.cart=[];saveLocal();
      openSheet('<div style="text-align:center;padding:18px"><div class="mark" style="width:78px;height:78px;margin:0 auto 16px"></div><div class="tiny">تم إنشاء الطلب الحقيقي</div><h2>وصل طلبك إلى مَخْرَج</h2><div class="price" style="font-size:26px">MK-'+String(order.order_number).padStart(6,'0')+'</div><p class="muted">الإجمالي '+money(order.total)+'. حالة الدفع الآن: '+paymentLabel(order.payment_status)+'.</p><div class="notice">لن نعتبر الطلب مدفوعًا حتى نربط بوابة الدفع ونستلم تأكيد الدفع من الخادم.</div><button class="primary" id="seeOrders" style="width:100%;margin-top:14px">عرض طلباتي</button></div>');
      $('#seeOrders',els.panel).onclick=()=>{closeSheet();showView('orders');};
    }catch(e){
      console.error(e);btn.disabled=false;btn.textContent='إنشاء الطلب';
      msg.textContent=e.message?.includes('insufficient stock')?'تغير المخزون لأحد المنتجات. عدّل السلة وحاول مجددًا.':'تعذر إنشاء الطلب: '+(e.message||'خطأ غير متوقع');
      msg.className='danger';
    }
  }

  function openAuth(mode='login',notice=''){
    openSheet('<div class="sheethead"><div><div class="tiny">حساب مَخْرَج</div><h2 style="margin:2px 0">الدخول والمتابعة</h2></div><button class="close" data-close>×</button></div>'+
      (notice?'<div class="notice">'+esc(notice)+'</div>':'')+
      '<div class="auth-tabs"><button id="loginTab" class="'+(mode==='login'?'on':'')+'">تسجيل الدخول</button><button id="signupTab" class="'+(mode==='signup'?'on':'')+'">حساب جديد</button></div><div id="authBody"></div>');
    $('[data-close]',els.panel).onclick=closeSheet;
    $('#loginTab',els.panel).onclick=()=>renderAuthBody('login');
    $('#signupTab',els.panel).onclick=()=>renderAuthBody('signup');
    renderAuthBody(mode);
  }
  function renderAuthBody(mode){
    $('#loginTab',els.panel).classList.toggle('on',mode==='login');$('#signupTab',els.panel).classList.toggle('on',mode==='signup');
    $('#authBody',els.panel).innerHTML=mode==='login'
      ?'<div class="formgrid"><input class="field" id="authEmail" type="email" autocomplete="email" placeholder="البريد الإلكتروني"><input class="field" id="authPass" type="password" autocomplete="current-password" placeholder="كلمة المرور"><button class="primary" id="authSubmit">تسجيل الدخول</button><button class="secondary" id="forgotBtn">نسيت كلمة المرور</button><div id="authMsg" class="tiny"></div></div>'
      :'<div class="formgrid"><input class="field" id="authName" placeholder="الاسم الكامل"><input class="field" id="authEmail" type="email" autocomplete="email" placeholder="البريد الإلكتروني"><input class="field" id="authPass" type="password" autocomplete="new-password" placeholder="كلمة المرور (6 أحرف على الأقل)"><button class="primary" id="authSubmit">إنشاء الحساب</button><div id="authMsg" class="tiny"></div></div>';
    $('#authSubmit',els.panel).onclick=()=>mode==='login'?login():signup();
    const f=$('#forgotBtn',els.panel);if(f)f.onclick=forgotPassword;
  }
  async function login(){
    const msg=$('#authMsg',els.panel),email=$('#authEmail',els.panel).value.trim(),password=$('#authPass',els.panel).value;
    msg.textContent='جارٍ تسجيل الدخول…';
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){msg.textContent=error.message;msg.className='danger';return;}
    await afterAuth();closeSheet();toast('أهلًا بك');render();
  }
  async function signup(){
    const msg=$('#authMsg',els.panel),full_name=$('#authName',els.panel).value.trim(),email=$('#authEmail',els.panel).value.trim(),password=$('#authPass',els.panel).value;
    if(!full_name){msg.textContent='اكتب الاسم.';msg.className='danger';return;}
    msg.textContent='جارٍ إنشاء الحساب…';
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name}}});
    if(error){msg.textContent=error.message;msg.className='danger';return;}
    if(!data.session){msg.textContent='تم إنشاء الحساب. افتح رسالة التأكيد في بريدك ثم سجّل الدخول.';msg.className='ok';return;}
    state.session=data.session;await afterAuth();closeSheet();toast('تم إنشاء حسابك');render();
  }
  async function forgotPassword(){
    const email=$('#authEmail',els.panel).value.trim(),msg=$('#authMsg',els.panel);
    if(!email){msg.textContent='اكتب بريدك أولًا.';return;}
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    msg.textContent=error?error.message:'أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك.';
    msg.className=error?'danger':'ok';
  }

  async function toggleFavorite(productId){
    if(!state.session){
      state.favs.has(productId)?state.favs.delete(productId):state.favs.add(productId);saveLocal();renderProducts();toast('حُفظت المفضلة على هذا الجهاز');return;
    }
    if(state.favs.has(productId)){
      const {error}=await sb.from('wishlist_items').delete().eq('user_id',state.session.user.id).eq('product_id',productId);
      if(!error)state.favs.delete(productId);
    }else{
      const {error}=await sb.from('wishlist_items').insert({user_id:state.session.user.id,product_id:productId});
      if(!error)state.favs.add(productId);
    }
    saveLocal();renderProducts();
  }
  async function syncLocalFavorites(){
    const local=safeJson('makhraj-favs-prod',[]);
    if(!state.session||!local.length)return;
    await sb.from('wishlist_items').upsert(local.map(product_id=>({user_id:state.session.user.id,product_id})),{onConflict:'user_id,product_id',ignoreDuplicates:true});
  }
  async function loadFavorites(){
    if(!state.session)return;
    const {data}=await sb.from('wishlist_items').select('product_id').eq('user_id',state.session.user.id);
    state.favs=new Set((data||[]).map(x=>x.product_id));saveLocal();renderProducts();
  }

  function showView(view){
    els.home.classList.toggle('hidden',view!=='home');els.orders.classList.toggle('hidden',view!=='orders');els.account.classList.toggle('hidden',view!=='account');
    $$('.bottom button[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===view));
    if(view==='orders') loadOrders();
    if(view==='account') renderAccount();
    scrollTo({top:0,behavior:'smooth'});
  }
  async function loadOrders(){
    if(!state.session){els.ordersList.innerHTML='<div class="empty"><b>سجّل الدخول لرؤية طلباتك.</b><br><button class="primary" id="ordersLogin" style="margin-top:12px">تسجيل الدخول</button></div>';$('#ordersLogin').onclick=()=>openAuth();return;}
    els.ordersList.innerHTML='<div class="loading">جارٍ تحميل الطلبات…</div>';
    const {data,error}=await sb.from('orders').select('id,order_number,status,payment_status,total,created_at,shipping_address,order_items(product_name,variant_title,quantity,unit_price,line_total),order_events(id,status,title,description,created_at)').order('created_at',{ascending:false});
    if(error){els.ordersList.innerHTML='<div class="error">تعذر تحميل الطلبات.</div>';return;}
    if(!data?.length){els.ordersList.innerHTML='<div class="empty">لا توجد طلبات حتى الآن.</div>';return;}
    els.ordersList.innerHTML=data.map(o=>'<article class="card account-card orderrow" data-order="'+o.id+'"><div class="grow"><b>MK-'+String(o.order_number).padStart(6,'0')+'</b><div class="tiny">'+new Date(o.created_at).toLocaleString('ar-US')+'</div></div><span class="order-status">'+statusLabel(o.status)+'</span><span class="price">'+money(o.total)+'</span></article>').join('');
    $$('[data-order]',els.ordersList).forEach(r=>r.onclick=()=>openOrder(data.find(o=>o.id===r.dataset.order)));
  }
  function openOrder(o){
    const events=[...(o.order_events||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    const timeline=events.length
      ? '<div class="section"><h2>تتبع الطلب</h2></div>'+events.map(ev=>'<div class="summary"><b>'+esc(ev.title)+'</b><div class="tiny">'+new Date(ev.created_at).toLocaleString('ar-US')+'</div>'+(ev.description?'<div class="muted">'+esc(ev.description)+'</div>':'')+'</div>').join('')
      : '';
    openSheet('<div class="sheethead"><div><div class="tiny">تفاصيل الطلب</div><h2 style="margin:2px 0">MK-'+String(o.order_number).padStart(6,'0')+'</h2></div><button class="close" data-close>×</button></div>'+
      '<div class="summary"><div class="line"><span>الحالة</span><b>'+statusLabel(o.status)+'</b></div><div class="line"><span>الدفع</span><b>'+paymentLabel(o.payment_status)+'</b></div><div class="line total"><span>الإجمالي</span><span class="price">'+money(o.total)+'</span></div></div>'+
      (o.order_items||[]).map(i=>'<div class="cartrow"><div class="grow"><b>'+esc(i.product_name)+'</b><div class="tiny">'+esc(i.variant_title||'')+' × '+i.quantity+'</div></div><b>'+money(i.line_total)+'</b></div>').join('')+
      timeline+
      '<div class="notice" style="margin-top:12px">عند ربط شركة الشحن سنضيف رقم التتبع والتحديثات الخارجية هنا تلقائيًا.</div>');
    $('[data-close]',els.panel).onclick=closeSheet;
  }

  function renderAccount(){
    if(!els.accountContent)return;
    if(!state.session){
      els.accountContent.innerHTML='<div class="card account-card"><h3>حساب مَخْرَج</h3><p class="muted">احفظ طلباتك وعناوينك ومفضلاتك على حسابك.</p><button class="primary" id="accLogin">تسجيل الدخول</button> <button class="secondary" id="accSignup">إنشاء حساب</button></div>';
      $('#accLogin').onclick=()=>openAuth('login');$('#accSignup').onclick=()=>openAuth('signup');return;
    }
    els.accountContent.innerHTML='<div class="card account-card"><div class="tiny">مسجل الدخول</div><h3>'+esc(state.profile?.full_name||state.session.user.email)+'</h3><div class="muted">'+esc(state.session.user.email)+'</div><div class="account-actions"><button class="secondary" id="accOrders">طلباتي</button><button class="secondary" id="accFavs">المفضلة</button><button class="secondary" id="accLogout">تسجيل الخروج</button></div></div><div id="favArea"></div>';
    $('#accOrders').onclick=()=>showView('orders');$('#accFavs').onclick=()=>renderFavArea();$('#accLogout').onclick=async()=>{await sb.auth.signOut();state.session=null;state.profile=null;toast('تم تسجيل الخروج');renderAccount();};
  }
  function renderFavArea(){
    const list=state.products.filter(p=>state.favs.has(p.id)),area=$('#favArea');
    area.innerHTML='<div class="section"><h2>المفضلة</h2><span class="tiny">'+list.length+'</span></div>'+(list.length?'<div class="grid">'+list.map(p=>'<article class="card account-card" data-favopen="'+p.id+'"><b>'+esc(p.name)+'</b><div class="price">'+money(minPrice(p))+'</div></article>').join('')+'</div>':'<div class="empty">لا توجد منتجات في المفضلة.</div>');
    $$('[data-favopen]',area).forEach(x=>x.onclick=()=>openProduct(x.dataset.favopen));
  }

  function openSmart(){
    openSheet('<div class="sheethead"><div><div class="tiny">اختيار من منتجات متجرك الحقيقية</div><h2 style="margin:2px 0">ساعدني أختار</h2></div><button class="close" data-close>×</button></div><div class="smartbox"><textarea class="field" id="smartNeed" rows="4" placeholder="مثال: أحتاج هدية أنيقة تحت 50 دولار ولا أعرف ماذا أختار"></textarea><input class="field" id="smartBudget" type="number" inputmode="decimal" placeholder="الميزانية القصوى (اختياري)" style="margin-top:8px"><button class="primary" id="smartGo" style="width:100%;margin-top:10px">ابحث في المنتجات المتاحة</button><div id="smartOut" class="smart-results"></div><p class="tiny">هذه الميزة لا تخترع منتجات. النتائج تأتي فقط من المنتجات المنشورة والمتوفرة في قاعدة مَخْرَج.</p></div>');
    $('[data-close]',els.panel).onclick=closeSheet;$('#smartGo',els.panel).onclick=runSmart;
  }
  function runSmart(){
    const text=$('#smartNeed',els.panel).value.trim().toLowerCase(),budget=Number($('#smartBudget',els.panel).value)||Infinity,out=$('#smartOut',els.panel);
    if(!text){out.innerHTML='<div class="danger">اكتب ما تحتاجه أولًا.</div>';return;}
    const words=text.split(/\s+/).filter(w=>w.length>2);
    let ranked=state.products.map(p=>{
      const stock=totalStock(p),price=minPrice(p),hay=(p.name+' '+(p.description||'')+' '+(p.categories?.name||'')).toLowerCase();
      let score=stock>0?10:-100; words.forEach(w=>{if(hay.includes(w))score+=12;});
      if(/هدية|مناسبة|عزيز|زوج|زوجة/.test(text)&&/هدية|عطر|ساعة|اكسسوار|إكسسوار/.test(hay))score+=8;
      if(/رخيص|اوفر|أوفر|توفير|أقل/.test(text))score+=Math.max(0,30-price)/3;
      if(price<=budget)score+=12;else score-=50;
      if(p.featured)score+=2;
      return{p,score,price};
    }).filter(x=>x.score>0&&x.price<=budget).sort((a,b)=>b.score-a.score).slice(0,3);
    if(!ranked.length){out.innerHTML='<div class="notice"><b>لا يوجد مخرج مناسب في المنتجات المنشورة حاليًا.</b><br>لن أعرض منتجًا غير موجود أو يتجاوز ميزانيتك.</div>';return;}
    out.innerHTML=ranked.map((x,i)=>'<button class="smart-item" data-smart="'+x.p.id+'" style="text-align:right;color:#fff"><div class="tiny">'+(i===0?'الأقرب لطلبك':'بديل '+(i+1))+'</div><b>'+esc(x.p.name)+'</b><div class="price">'+money(x.price)+'</div><div class="tiny">'+esc(x.p.description||'متوفر في المتجر')+'</div></button>').join('');
    $$('[data-smart]',out).forEach(b=>b.onclick=()=>openProduct(b.dataset.smart));
  }

  function statusLabel(s){return({pending:'مستلم',confirmed:'مؤكد',processing:'قيد التجهيز',shipped:'تم الشحن',delivered:'تم التسليم',cancelled:'ملغى',refunded:'مسترد'})[s]||s}
  function paymentLabel(s){return({unpaid:'غير مدفوع',authorized:'مصرح',paid:'مدفوع',partially_refunded:'استرداد جزئي',refunded:'مسترد',failed:'فشل الدفع'})[s]||s}

  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
  init().catch(err=>{console.error(err);els.grid.innerHTML='<div class="error">حدث خطأ أثناء تشغيل المتجر.</div>';});
})();