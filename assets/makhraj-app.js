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

  const SUPPORT_LANGUAGES = {
    ar:'العربية',en:'English',es:'Español',fr:'Français',tr:'Türkçe',de:'Deutsch',it:'Italiano',pt:'Português',
    ru:'Русский',zh:'中文',ja:'日本語',ko:'한국어',hi:'हिन्दी',ur:'اردو',fa:'فارسی',bn:'বাংলা',
    id:'Bahasa Indonesia',vi:'Tiếng Việt',pl:'Polski',nl:'Nederlands',sv:'Svenska',uk:'Українська',ro:'Română',el:'Ελληνικά'
  };
  function supportLanguageOptions(selected){
    return Object.entries(SUPPORT_LANGUAGES).map(([code,label])=>'<option value="'+code+'" '+(code===selected?'selected':'')+'>'+esc(label)+'</option>').join('');
  }


  const state = {
    products: [], categories: [], activeCategory: 'all', search: '', sort: 'featured', inStockOnly: true,
    session: null, profile: null, selectedProduct: null, selectedVariant: null, activeSupportTicket: null,
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
    state.activeSupportTicket = null;
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
    const initialParams=new URLSearchParams(location.search);
    await handlePaymentReturn();
    if(!initialParams.get('payment')) handleProductDeepLink(initialParams);
  }

  async function handlePaymentReturn(){
    const params=new URLSearchParams(location.search);
    const payment=params.get('payment');
    if(!payment)return;
    const orderId=params.get('order_id')||sessionStorage.getItem('makhraj-pending-order')||'';
    history.replaceState({},'',location.pathname);
    if(payment==='success'){
      state.cart=[];saveLocal();sessionStorage.removeItem('makhraj-pending-order');
      openSheet('<div style="text-align:center;padding:20px"><div class="mark" style="width:78px;height:78px;margin:0 auto 16px"></div><div class="tiny">Stripe Checkout</div><h2>تمت عملية الدفع</h2><p class="muted">نؤكد العملية من خادم Stripe الآن. ستظهر حالة الطلب «مدفوع» تلقائيًا فور وصول التأكيد.</p><button class="primary" id="paymentOrders" style="width:100%">عرض طلباتي</button></div>');
      $('#paymentOrders',els.panel).onclick=()=>{closeSheet();showView('orders');};
      window.MakhrajLearning?.event?.('order_created',{terms:window.MakhrajLearning?.getTerms?.()||[],context:{order_id:orderId,payment:'stripe'}});
    }else if(payment==='cancelled'){
      if(orderId&&state.session){
        const {error}=await sb.functions.invoke('cancel-stripe-checkout',{body:{order_id:orderId}});
        toast(error?'أُلغي الدفع، وسيتم تحرير الحجز تلقائيًا.':'تم إلغاء الدفع وإعادة المخزون.');
      }else{
        toast('تم إلغاء صفحة الدفع. لم يتم تحصيل أموال.');
      }
      sessionStorage.removeItem('makhraj-pending-order');
    }
  }

  function bindStatic(){
    $('#cartTopBtn').onclick = openCart;
    const browse=$('#browseNowBtn'); if(browse) browse.onclick=()=>document.querySelector('#productGrid')?.scrollIntoView({behavior:'smooth',block:'start'});
    const heroNeed=$('#heroNeedBtn'); if(heroNeed) heroNeed.onclick=()=>document.querySelector('.need-hero')?.scrollIntoView({behavior:'smooth',block:'start'});
    document.addEventListener('makhraj:languagechange', async e=>{
      const language=e.detail?.language;
      if(state.session && language){
        await sb.from('profiles').update({preferred_language:language}).eq('id',state.session.user.id);
        if(state.activeSupportTicket) openTicket(state.activeSupportTicket);
      }
    });
    $('#refreshBtn').onclick = async()=>{ await Promise.all([loadCategories(),loadProducts()]); render(); toast('تم تحديث المتجر'); };
    $('#smartPickBtn').onclick = openSmart;
    $('#accountHeroBtn').onclick = ()=>showView('account');
    els.search.addEventListener('input',()=>{ state.search=els.search.value.trim().toLowerCase(); renderProducts(); });
    const sort=$('#sortProducts'); if(sort) sort.onchange=()=>{state.sort=sort.value;renderProducts();};
    const stockOnly=$('#inStockOnly'); if(stockOnly) stockOnly.onchange=()=>{state.inStockOnly=stockOnly.checked;renderProducts();};
    $$('.bottom button').forEach(b=>{
      b.onclick=()=>{
        if(b.dataset.view) showView(b.dataset.view);
        if(b.dataset.action==='focus-search'){ showView('home'); setTimeout(()=>els.search.focus(),80); }
        if(b.dataset.action==='smart') openSmart();
      };
    });
    sb.auth.onAuthStateChange(async (_event,session)=>{
      state.session=session;
      if(session) await afterAuth(); else {
        state.profile=null;
        state.favs=new Set(safeJson('makhraj-favs-prod',[]));
        const adminTop=$('#adminTopBtn'); if(adminTop) adminTop.classList.add('hidden');
      }
      renderAccount();
    });
  }

  async function afterAuth(){
    await loadProfile();
    if(state.profile?.preferred_language && !localStorage.getItem('makhraj-language')){
      window.MakhrajI18n?.setLanguage(state.profile.preferred_language);
    }
    const adminTop=$('#adminTopBtn');
    if(adminTop){
      adminTop.classList.toggle('hidden', state.profile?.role!=='admin');
      adminTop.onclick=()=>{ location.href='seller.html'; };
    }
    await syncLocalFavorites();
    await loadFavorites();
  }
  async function loadProfile(){
    if(!state.session) return;
    const {data,error}=await sb.from('profiles').select('*').eq('id',state.session.user.id).maybeSingle();
    if(!error) state.profile=data;
  }

  async function loadSettings(){
    const {data}=await sb.from('store_settings').select('store_name,currency,free_shipping_threshold,standard_shipping_fee,support_email,test_mode,cash_on_delivery_enabled,checkout_enabled,stripe_online_enabled').eq('id',1).maybeSingle();
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
      .select('id,name,slug,description,brand,tags,specifications,status,base_price,compare_at_price,featured,category_id,categories(name,slug),product_images(id,url,alt_text,sort_order),product_variants(id,sku,barcode,title,price,stock_quantity,low_stock_threshold,weight_grams,attributes,is_active)')
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
    renderCategoryShowcase();
    renderProducts();
    renderAccount();
  }
  function catalogCategories(){
    // Keep every active category, including categories without products.
    return state.categories.map(c=>{
      const products=state.products.filter(p=>p.category_id===c.id);
      return {...c,productCount:products.length,availableCount:products.filter(p=>totalStock(p)>0).length};
    });
  }
  function scrollToCatalog(anchor){
    if(!anchor)return;
    anchor.style.scrollMarginTop=(($('.topbar')?.getBoundingClientRect().height||80)+24)+'px';
    anchor.scrollIntoView({behavior:'auto',block:'start'});
    anchor.focus({preventScroll:true});
  }
  function backToCategories(){
    selectCategory('all');
    scrollToCatalog($('.category-heading')||$('#categoryShowcase'));
  }
  function renderCategoryView(){
    const category=catalogCategories().find(c=>c.id===state.activeCategory);
    els.home.classList.toggle('category-mode',!!category);
    const header=$('#categoryViewHeader');
    if(!header)return;
    header.classList.toggle('hidden',!category);
    if(category){
      $('#categoryViewTitle').textContent=category.name;
      $('#categoryViewSummary').textContent='عدد المنتجات في هذا القسم: '+category.productCount;
    }
    const back=$('#backToCategories');if(back)back.onclick=backToCategories;
  }
  function selectCategory(id,scroll=false){
    state.activeCategory=catalogCategories().some(c=>c.id===id)?id:'all';
    state.search='';els.search.value='';
    const products=state.products.filter(p=>state.activeCategory==='all'||p.category_id===state.activeCategory);
    if(state.inStockOnly&&products.length&&!products.some(p=>totalStock(p)>0)){
      state.inStockOnly=false;
      const stockOnly=$('#inStockOnly');if(stockOnly)stockOnly.checked=false;
    }
    renderCategories();renderCategoryShowcase();renderProducts();
    if(scroll)scrollToCatalog((state.activeCategory!=='all'?$('#categoryViewHeader'):null)||$('#productsHeading')||els.grid);
  }
  function renderCategoryShowcase(){
    const box=$('#categoryShowcase');if(!box)return;
    const categories=catalogCategories();
    box.classList.toggle('hidden',!categories.length);
    $('.category-heading')?.classList.toggle('hidden',!categories.length);
    box.innerHTML=categories.map(c=>'<button type="button" class="category-tile" data-cat-tile="'+c.id+'" aria-controls="productGrid" aria-pressed="'+(state.activeCategory===c.id)+'"><span>قسم</span><b>'+esc(c.name)+'</b><span class="tiny">'+(c.productCount?'عدد المنتجات: '+c.productCount:'لا توجد منتجات بعد')+'</span><span class="arrow" aria-hidden="true">←</span></button>').join('');
    $$('[data-cat-tile]',box).forEach(b=>b.onclick=()=>selectCategory(b.dataset.catTile,true));
  }
  function renderCategories(){
    const categories=catalogCategories();
    if(state.activeCategory!=='all'&&!categories.some(c=>c.id===state.activeCategory))state.activeCategory='all';
    const all='<button type="button" class="chip '+(state.activeCategory==='all'?'on':'')+'" data-cat="all" aria-pressed="'+(state.activeCategory==='all')+'">الكل</button>';
    els.chips.innerHTML=all+categories.map(c=>'<button type="button" class="chip '+(state.activeCategory===c.id?'on':'')+'" data-cat="'+c.id+'" aria-pressed="'+(state.activeCategory===c.id)+'">'+esc(c.name)+' · '+c.productCount+'</button>').join('');
    $$('.chip',els.chips).forEach(b=>b.onclick=()=>selectCategory(b.dataset.cat,true));
  }
  function filteredProducts(){
    const list=state.products.filter(p=>{
      const cat=state.activeCategory==='all'||p.category_id===state.activeCategory;
      const hay=(p.name+' '+(p.description||'')+' '+(p.categories?.name||'')+' '+(p.brand||'')+' '+(p.tags||[]).join(' ')).toLowerCase();
      const stockOk=!state.inStockOnly||totalStock(p)>0;
      return cat && stockOk && (!state.search || hay.includes(state.search));
    });
    return list.sort((a,b)=>{
      if(state.sort==='price_asc')return minPrice(a)-minPrice(b);
      if(state.sort==='price_desc')return minPrice(b)-minPrice(a);
      if(state.sort==='name')return String(a.name).localeCompare(String(b.name),'ar');
      return Number(b.featured)-Number(a.featured);
    });
  }
  function productImage(p){ return p.product_images?.[0]?.url || ''; }
  function minPrice(p){
    const prices=(p.product_variants||[]).filter(v=>v.stock_quantity>0).map(v=>Number(v.price ?? p.base_price));
    return prices.length?Math.min(...prices):Number(p.base_price);
  }
  function totalStock(p){ return (p.product_variants||[]).reduce((s,v)=>s+Number(v.stock_quantity||0),0); }
  function renderProducts(){
    renderCategoryView();
    const list=filteredProducts();
    const category=state.categories.find(c=>c.id===state.activeCategory);
    const heading=$('#productsHeading');
    if(heading)heading.textContent=category?.name||'كل المنتجات';
    els.count.textContent=list.length+' منتج';
    if(!list.length){
      const emptyCategory=category&&!state.products.some(p=>p.category_id===category.id);
      const message=emptyCategory?'لا توجد منتجات في قسم «'+esc(category.name)+'» حتى الآن.':!state.products.length?'لا توجد منتجات منشورة حاليًا.':state.search?'لا توجد نتائج لهذا البحث.':'لا توجد منتجات متوفرة ضمن الاختيار الحالي.';
      els.grid.innerHTML='<div class="empty"><b>'+message+'</b>'+(emptyCategory?'<p class="tiny">ستظهر هنا المنتجات التي تُضاف إلى هذا القسم.</p><button type="button" class="secondary" id="backToCategoryList">الرجوع إلى الأقسام</button>':state.products.length?'<br><button type="button" class="secondary" id="resetCatalogFilters" style="margin-top:12px">عرض جميع المنتجات</button>':'')+'</div>';
      const back=$('#backToCategoryList');if(back)back.onclick=backToCategories;
      const reset=$('#resetCatalogFilters');if(reset)reset.onclick=()=>{state.inStockOnly=false;const stockOnly=$('#inStockOnly');if(stockOnly)stockOnly.checked=false;selectCategory('all',true);};
      return;
    }
    els.grid.innerHTML=list.map(p=>{
      const img=productImage(p),stock=totalStock(p),fav=state.favs.has(p.id),price=minPrice(p);
      const compare=Number(p.compare_at_price||0),discount=compare>price?Math.round((compare-price)/compare*100):0;
      return '<article class="card product" data-product="'+p.id+'">'+
        (discount>0?'<span class="sale-badge">-'+discount+'%</span>':'')+
        '<button class="fav" data-fav="'+p.id+'" aria-label="المفضلة">'+(fav?'♥':'♡')+'</button>'+
        '<div class="pimg" '+(img?'style="background-image:url(\''+esc(img)+'\')"':'')+'>'+(img?'':'لا توجد صورة')+'</div>'+
        '<div class="pbody"><div class="tiny">'+esc(p.categories?.name||'مَخْرَج')+'</div><h3>'+esc(p.name)+'</h3>'+
        '<span class="price">'+money(price)+'</span> '+(compare>price?'<span class="old">'+money(compare)+'</span>':'')+
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
      '<p class="muted">'+esc(p.description||'سيظهر وصف المنتج هنا عند إضافته من لوحة الإدارة.')+'</p>'+      ((p.tags||[]).length?'<div class="chips" style="margin-bottom:12px">'+p.tags.map(t=>'<span class="chip">'+esc(t)+'</span>').join('')+'</div>':'')+      (Object.keys(p.specifications||{}).length?'<div class="summary"><b>المواصفات</b>'+Object.entries(p.specifications||{}).map(([k,v])=>'<div class="line"><span class="muted">'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join('')+'</div>':'')+
      '<div class="tiny">اختر الخيار المناسب</div><div class="variant-list" id="variantList">'+
      (variants.length?variants.map((v,i)=>'<button class="variant '+(i===0?'on':'')+'" data-variant="'+v.id+'">'+esc(v.title)+' · '+money(v.price??p.base_price)+' <span class="tiny">('+v.stock_quantity+')</span></button>').join(''):'<span class="danger">نفد المخزون</span>')+
      '</div><div class="line"><div class="qty"><button id="qtyMinus">−</button><b id="qtyValue">1</b><button id="qtyPlus">+</button></div><span class="tiny" id="stockText">'+(state.selectedVariant?'المتاح '+state.selectedVariant.stock_quantity:'')+'</span></div>'+
      '<div class="product-cta"><button class="primary" id="addToCartBtn" '+(!state.selectedVariant?'disabled':'')+'>أضف إلى السلة</button><button class="secondary" id="shareProductBtn">مشاركة المنتج</button></div>'+
      '<div class="purchase-trust"><span>✓ السعر والمخزون يعاد التحقق منهما عند الطلب</span><span>✓ الدفع الإلكتروني عبر Stripe عند تفعيله</span></div>'+
      '<div class="section"><h2>التقييمات</h2><span class="tiny">من مشتريات مؤكدة</span></div><div id="reviewsArea"><div class="loading">جارٍ تحميل التقييمات…</div></div>');
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
    $('#shareProductBtn',els.panel).onclick=()=>shareProduct(p);
    loadReviews(p.id);
  }

  async function loadReviews(productId){
    const area=$('#reviewsArea',els.panel); if(!area)return;
    const {data,error}=await sb.from('reviews').select('id,rating,title,body,is_approved,created_at,user_id').eq('product_id',productId).order('created_at',{ascending:false});
    if(error){area.innerHTML='<div class="error">تعذر تحميل التقييمات.</div>';return}
    const reviews=data||[];
    const avg=reviews.filter(r=>r.is_approved).length?reviews.filter(r=>r.is_approved).reduce((s,r)=>s+r.rating,0)/reviews.filter(r=>r.is_approved).length:null;
    area.innerHTML=(avg?'<div class="summary"><div class="line"><b>متوسط التقييم</b><span class="price">★ '+avg.toFixed(1)+'</span></div></div>':'')+
      (reviews.length?reviews.map(r=>'<div class="summary"><div class="line"><b>'+'★'.repeat(r.rating)+'</b><span class="tiny">'+new Date(r.created_at).toLocaleDateString('ar-US')+'</span></div>'+(r.title?'<b>'+esc(r.title)+'</b>':'')+'<div class="muted">'+esc(r.body||'')+'</div>'+(!r.is_approved?'<div class="tiny">بانتظار المراجعة</div>':'')+'</div>').join(''):'<div class="empty">لا توجد تقييمات بعد.</div>')+
      (state.session?'<div class="summary"><b>قيّم مشترياتك</b><div class="formgrid" style="margin-top:8px"><select class="field" id="reviewRating"><option value="5">5 نجوم</option><option value="4">4 نجوم</option><option value="3">3 نجوم</option><option value="2">نجمتان</option><option value="1">نجمة</option></select><input class="field" id="reviewTitle" placeholder="عنوان التقييم"><textarea class="field" id="reviewBody" rows="3" placeholder="اكتب تجربتك"></textarea><button class="secondary" id="submitReview">إرسال التقييم</button><div id="reviewMsg" class="tiny"></div></div></div>':'<div class="tiny">سجّل الدخول بعد استلام طلبك لتقييم المنتج.</div>');
    const btn=$('#submitReview',area); if(btn)btn.onclick=()=>submitReview(productId);
  }

  async function submitReview(productId){
    const area=$('#reviewsArea',els.panel),m=$('#reviewMsg',area);
    const row={user_id:state.session.user.id,product_id:productId,rating:Number($('#reviewRating',area).value),title:$('#reviewTitle',area).value.trim()||null,body:$('#reviewBody',area).value.trim()||null};
    const {error}=await sb.from('reviews').upsert(row,{onConflict:'user_id,product_id'});
    if(error){m.textContent=error.message?.includes('delivered purchase')?'يمكنك التقييم بعد استلام طلب يحتوي هذا المنتج.':error.message;m.className='danger';return}
    toast('تم إرسال تقييمك للمراجعة');loadReviews(productId);
  }

  function handleProductDeepLink(params=new URLSearchParams(location.search)){
    const productId=params.get('product'); if(!productId)return;
    const product=state.products.find(p=>p.id===productId);
    if(product)setTimeout(()=>openProduct(productId),50);
  }
  async function shareProduct(p){
    const url=new URL(location.href);url.search='';url.searchParams.set('product',p.id);
    try{
      if(navigator.share){await navigator.share({title:p.name,text:p.description||p.name,url:url.href});return}
      await navigator.clipboard.writeText(url.href);toast('تم نسخ رابط المنتج');
    }catch(e){if(e?.name!=='AbortError')toast('تعذر مشاركة الرابط الآن')}
  }

  function addToCart(p,v,qty){
    if(!v) return;
    const existing=state.cart.find(x=>x.variantId===v.id);
    const max=Number(v.stock_quantity||0);
    if(existing) existing.qty=Math.min(max,existing.qty+qty);
    else state.cart.push({variantId:v.id,productId:p.id,productName:p.name,variantTitle:v.title,price:Number(v.price??p.base_price),qty:Math.min(qty,max),image:productImage(p)});
    saveLocal();window.MakhrajLearning?.event?.('add_to_cart',{productId:p.id,terms:window.MakhrajLearning?.getTerms?.()||[],context:{qty:Number(qty||1)}});toast('أضيف إلى السلة');openCart();
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
      '<div class="summary"><div class="line"><span>المجموع التقديري</span><b>'+money(sub)+'</b></div><div class="line"><span>الشحن</span><b>'+(ship?money(ship):'مجاني')+'</b></div><div class="line total"><span>الإجمالي التقديري</span><span class="price">'+money(total)+'</span></div>'+(sub>0&&threshold>sub?'<div class="shipping-progress"><b>أضف '+money(threshold-sub)+' لتحصل على شحن مجاني</b><div><span style="width:'+Math.min(100,sub/threshold*100)+'%"></span></div></div>':'')+'<div class="tiny">السعر النهائي والمخزون يعاد التحقق منهما على الخادم عند إنشاء الطلب.</div></div>'+
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
    window.MakhrajLearning?.event?.('checkout_start',{terms:window.MakhrajLearning?.getTerms?.()||[],context:{items:state.cart.length,subtotal:cartEstimate()}});
    if(!state.session){ openAuth('login','سجّل الدخول أولًا حتى نستطيع حفظ طلبك ومتابعته.'); return; }
    const {data:addresses}=await sb.from('addresses').select('*').order('is_default',{ascending:false}).order('created_at',{ascending:false});
    const list=addresses||[],def=list.find(a=>a.is_default)||list[0]||null;
    openSheet('<div class="sheethead"><h2 style="margin:0">بيانات التوصيل</h2><button class="close" data-close>×</button></div>'+
      '<div class="formgrid">'+
      (list.length?'<select class="field" id="coSaved"><option value="">استخدام عنوان جديد</option>'+list.map(a=>'<option value="'+a.id+'" '+(def?.id===a.id?'selected':'')+'>'+esc(a.label||'عنوان')+' — '+esc(a.line1)+'، '+esc(a.city)+'</option>').join('')+'</select>':'')+
      '<input class="field" id="coName" placeholder="اسم المستلم"><input class="field" id="coPhone" inputmode="tel" placeholder="رقم الهاتف"><input class="field" id="coLine1" placeholder="العنوان"><input class="field" id="coLine2" placeholder="شقة / تفاصيل إضافية (اختياري)"><div class="line"><input class="field" id="coCity" placeholder="المدينة"><input class="field" id="coState" placeholder="الولاية"></div><input class="field" id="coZip" placeholder="ZIP Code" inputmode="numeric"><div class="line"><input class="field" id="coCoupon" placeholder="كود خصم (اختياري)"><button class="secondary" id="applyCouponBtn" type="button">تطبيق</button></div><div id="quoteSummary"></div><div id="paymentMethodWrap"></div><textarea class="field" id="coNotes" rows="3" placeholder="ملاحظات للطلب (اختياري)"></textarea><label class="tiny"><input type="checkbox" id="saveAddress" '+(!def?'checked':'')+'> حفظ هذا العنوان في حسابي</label><button class="primary" id="placeOrderBtn">متابعة الدفع</button><div id="checkoutMsg" class="tiny"></div></div>');
    $('[data-close]',els.panel).onclick=closeSheet;
    const fill=a=>{
      $('#coName',els.panel).value=a?.recipient_name||state.profile?.full_name||'';
      $('#coPhone',els.panel).value=a?.phone||state.profile?.phone||'';
      $('#coLine1',els.panel).value=a?.line1||'';
      $('#coLine2',els.panel).value=a?.line2||'';
      $('#coCity',els.panel).value=a?.city||'';
      $('#coState',els.panel).value=a?.state||'';
      $('#coZip',els.panel).value=a?.postal_code||'';
    };
    fill(def);
    const payWrap=$('#paymentMethodWrap',els.panel);
    const methods=[];
    if(state.settings.stripe_online_enabled)methods.push(['online','الدفع الآمن أونلاين عبر Stripe']);
    if(state.settings.cash_on_delivery_enabled)methods.push(['cash_on_delivery','الدفع عند الاستلام']);
    if(state.settings.test_mode)methods.push(['test','طلب تجريبي — بدون تحصيل أموال']);
    if(!state.settings.checkout_enabled){
      payWrap.innerHTML='<div class="notice">الطلبات متوقفة مؤقتًا من إعدادات المتجر.</div>';
      $('#placeOrderBtn',els.panel).disabled=true;
    }else if(methods.length){
      payWrap.innerHTML='<select class="field" id="coPaymentMethod">'+methods.map((m,i)=>'<option value="'+m[0]+'">'+m[1]+'</option>').join('')+'</select>';
    }else{
      payWrap.innerHTML='<div class="notice">لم يتم تفعيل وسيلة دفع أو طلب بعد. اربط الدفع الإلكتروني أو فعّل الدفع عند الاستلام من الإدارة.</div>';
      $('#placeOrderBtn',els.panel).disabled=true;
    }
    const saved=$('#coSaved',els.panel);
    if(saved)saved.onchange=()=>{const a=list.find(x=>x.id===saved.value)||null;fill(a);$('#saveAddress',els.panel).checked=!a;};
    $('#applyCouponBtn',els.panel).onclick=updateCheckoutQuote;
    $('#placeOrderBtn',els.panel).onclick=placeOrder;
    updateCheckoutQuote();
  }

  async function updateCheckoutQuote(){
    const box=$('#quoteSummary',els.panel); if(!box)return;
    box.innerHTML='<div class="tiny">جارٍ حساب الإجمالي من الخادم…</div>';
    try{
      await syncCartToServer();
      const code=$('#coCoupon',els.panel)?.value.trim()||null;
      const {data,error}=await sb.rpc('quote_cart',{p_coupon_code:code});
      if(error)throw error;
      const couponText=code
        ? (data.coupon_valid?'<div class="ok">تم تطبيق الكوبون.</div>':'<div class="danger">'+(data.coupon_message==='minimum_order_not_met'?'لم تصل للحد الأدنى لهذا الكوبون.':'الكوبون غير صالح أو منتهي.')+'</div>')
        : '';
      box.innerHTML='<div class="summary"><div class="line"><span>المنتجات</span><b>'+money(data.subtotal)+'</b></div><div class="line"><span>الخصم</span><b>'+money(data.discount_total)+'</b></div><div class="line"><span>الشحن</span><b>'+(Number(data.shipping_total)===0?'مجاني':money(data.shipping_total))+'</b></div><div class="line total"><span>الإجمالي</span><span class="price">'+money(data.total)+'</span></div>'+couponText+'</div>';
    }catch(e){
      console.error(e);box.innerHTML='<div class="danger">تعذر حساب الإجمالي الآن. '+esc(e.message||'')+'</div>';
    }
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
      const savedSelect=$('#coSaved',els.panel);
      if($('#saveAddress',els.panel).checked && (!savedSelect || !savedSelect.value)){
        await sb.from('addresses').insert({user_id:state.session.user.id,...address,label:'عنواني',is_default:false});
      }
      const paymentMethod=$('#coPaymentMethod',els.panel)?.value||'test';
      if(paymentMethod==='online'){
        btn.textContent='جارٍ فتح الدفع الآمن…';
        const {data,error}=await sb.functions.invoke('create-stripe-checkout',{
          body:{
            shipping_address:address,
            notes:$('#coNotes',els.panel).value.trim()||null,
            coupon_code:$('#coCoupon',els.panel).value.trim()||null
          }
        });
        if(error) throw error;
        if(!data?.checkout_url) throw new Error(data?.error||'تعذر إنشاء جلسة الدفع');
        sessionStorage.setItem('makhraj-pending-order',String(data.order_id||''));
        location.href=data.checkout_url;
        return;
      }

      const {data:orderId,error}=await sb.rpc('place_order',{p_shipping_address:address,p_notes:$('#coNotes',els.panel).value.trim()||null,p_coupon_code:$('#coCoupon',els.panel).value.trim()||null,p_payment_method:paymentMethod});
      if(error) throw error;
      const {data:order,error:e2}=await sb.from('orders').select('id,order_number,total,status,payment_status,created_at').eq('id',orderId).single();
      if(e2) throw e2;
      for(const item of state.cart){window.MakhrajLearning?.event?.('order_created',{productId:item.productId,terms:window.MakhrajLearning?.getTerms?.()||[],context:{order_id:orderId,qty:item.qty}})}
      state.cart=[];saveLocal();
      openSheet('<div style="text-align:center;padding:18px"><div class="mark" style="width:78px;height:78px;margin:0 auto 16px"></div><div class="tiny">تم إنشاء الطلب</div><h2>وصل طلبك إلى مَخْرَج</h2><div class="price" style="font-size:26px">MK-'+String(order.order_number).padStart(6,'0')+'</div><p class="muted">الإجمالي '+money(order.total)+'. حالة الدفع الآن: '+paymentLabel(order.payment_status)+'.</p><button class="primary" id="seeOrders" style="width:100%;margin-top:14px">عرض طلباتي</button></div>');
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
      ?'<div class="formgrid"><input class="field" id="authEmail" type="email" inputmode="email" autocomplete="email" placeholder="البريد الإلكتروني"><input class="field" id="authPass" type="password" autocomplete="current-password" placeholder="كلمة المرور"><button class="primary" id="authSubmit">تسجيل الدخول</button><button class="secondary" id="forgotBtn">نسيت كلمة المرور</button><div id="authMsg" class="tiny" aria-live="polite"></div><div class="auth-hint">الدخول هنا بحساب مَخْرَج المسجّل في التطبيق، وليس بحساب ChatGPT.</div></div>'
      :'<div class="formgrid"><input class="field" id="authName" autocomplete="name" placeholder="الاسم الكامل"><input class="field" id="authEmail" type="email" inputmode="email" autocomplete="email" placeholder="البريد الإلكتروني"><input class="field" id="authPass" type="password" autocomplete="new-password" placeholder="كلمة المرور (6 أحرف على الأقل)"><button class="primary" id="authSubmit">إنشاء الحساب</button><div id="authMsg" class="tiny" aria-live="polite"></div><div class="auth-hint">بعد إنشاء الحساب قد يرسل النظام رابط تأكيد إلى بريدك. أبقِ هذه النافذة مفتوحة حتى ترى النتيجة.</div></div>';
    $('#authSubmit',els.panel).onclick=()=>mode==='login'?login():signup();
    const f=$('#forgotBtn',els.panel);if(f)f.onclick=forgotPassword;
  }
  function friendlyAuthError(error){
    const text=String(error?.message||'حدث خطأ غير متوقع');
    if(/Invalid login credentials/i.test(text))return 'البريد أو كلمة المرور غير صحيحة.';
    if(/Email not confirmed/i.test(text))return 'حسابك موجود لكن البريد غير مؤكد. افتح رابط التأكيد في بريدك ثم حاول مرة أخرى.';
    if(/User already registered|already registered/i.test(text))return 'هذا البريد لديه حساب سابق. استخدم تسجيل الدخول أو استعادة كلمة المرور.';
    if(/Password should be|password/i.test(text))return 'كلمة المرور قصيرة أو غير مقبولة. استخدم 6 أحرف على الأقل.';
    if(/rate limit|too many/i.test(text))return 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم جرّب مرة أخرى.';
    return text;
  }
  function isValidEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
  async function login(){
    const msg=$('#authMsg',els.panel),btn=$('#authSubmit',els.panel),email=$('#authEmail',els.panel).value.trim(),password=$('#authPass',els.panel).value;
    if(!isValidEmail(email)||!password){msg.textContent='اكتب بريدًا صحيحًا وكلمة المرور.';msg.className='danger';return;}
    msg.textContent='جارٍ تسجيل الدخول…';
    msg.className='tiny';btn.disabled=true;btn.textContent='جارٍ الدخول…';
    const {error}=await sb.auth.signInWithPassword({email,password});
    btn.disabled=false;btn.textContent='تسجيل الدخول';
    if(error){msg.textContent=friendlyAuthError(error);msg.className='danger';return;}
    await afterAuth();closeSheet();toast('أهلًا بك');render();
  }
  async function signup(){
    const msg=$('#authMsg',els.panel),btn=$('#authSubmit',els.panel),full_name=$('#authName',els.panel).value.trim(),email=$('#authEmail',els.panel).value.trim(),password=$('#authPass',els.panel).value;
    if(!full_name){msg.textContent='اكتب الاسم.';msg.className='danger';return;}
    if(!isValidEmail(email)){msg.textContent='اكتب بريدًا إلكترونيًا صحيحًا.';msg.className='danger';return;}
    if(password.length<6){msg.textContent='كلمة المرور يجب أن تكون 6 أحرف على الأقل.';msg.className='danger';return;}
    msg.textContent='جارٍ إنشاء الحساب…';
    msg.className='tiny';btn.disabled=true;btn.textContent='جارٍ الإنشاء…';
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name}}});
    btn.disabled=false;btn.textContent='إنشاء الحساب';
    if(error){msg.textContent=friendlyAuthError(error);msg.className='danger';return;}
    if(!data.session){
      $('#authBody',els.panel).innerHTML='<div class="auth-success"><b>تم إنشاء الحساب.</b><br>أرسلنا رابط تأكيد إلى بريدك الإلكتروني. افتح الرابط من نفس الجهاز إن أمكن، ثم ارجع إلى مَخْرَج وسجّل الدخول.</div><button class="primary" id="backToLogin" style="width:100%;margin-top:10px">الانتقال لتسجيل الدخول</button>';
      $('#backToLogin',els.panel).onclick=()=>renderAuthBody('login');
      return;
    }
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
    if(view==='home'&&state.activeCategory!=='all')selectCategory('all');
    els.home.classList.toggle('hidden',view!=='home');els.orders.classList.toggle('hidden',view!=='orders');els.account.classList.toggle('hidden',view!=='account');
    $$('.bottom button[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===view));
    if(view==='orders') loadOrders();
    if(view==='account') renderAccount();
    scrollTo({top:0,behavior:'smooth'});
  }
  async function loadOrders(){
    if(!state.session){els.ordersList.innerHTML='<div class="empty"><b>سجّل الدخول لرؤية طلباتك.</b><br><button class="primary" id="ordersLogin" style="margin-top:12px">تسجيل الدخول</button></div>';$('#ordersLogin').onclick=()=>openAuth();return;}
    els.ordersList.innerHTML='<div class="loading">جارٍ تحميل الطلبات…</div>';
    const {data,error}=await sb.from('orders').select('id,order_number,status,payment_status,payment_method,total,created_at,shipping_address,shipping_carrier,tracking_number,shipped_at,delivered_at,order_items(product_id,variant_id,product_name,variant_title,quantity,unit_price,line_total),order_events(id,status,title,description,created_at)').order('created_at',{ascending:false});
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
    const canCancel=['pending','confirmed'].includes(o.status)&&['unpaid','failed'].includes(o.payment_status);
    openSheet('<div class="sheethead"><div><div class="tiny">تفاصيل الطلب</div><h2 style="margin:2px 0">MK-'+String(o.order_number).padStart(6,'0')+'</h2></div><button class="close" data-close>×</button></div>'+
      '<div class="summary"><div class="line"><span>الحالة</span><b>'+statusLabel(o.status)+'</b></div><div class="line"><span>طريقة الطلب</span><b>'+paymentMethodLabel(o.payment_method)+'</b></div><div class="line"><span>الدفع</span><b>'+paymentLabel(o.payment_status)+'</b></div><div class="line total"><span>الإجمالي</span><span class="price">'+money(o.total)+'</span></div></div>'+
      (o.order_items||[]).map(i=>'<div class="cartrow"><div class="grow"><b>'+esc(i.product_name)+'</b><div class="tiny">'+esc(i.variant_title||'')+' × '+i.quantity+'</div></div><b>'+money(i.line_total)+'</b></div>').join('')+
      '<button class="secondary" id="reorderBtn" style="width:100%;margin-top:10px">أعد هذا الطلب</button>'+
      timeline+
      ((o.tracking_number||o.shipping_carrier)?'<div class="summary"><div class="line"><span>شركة الشحن</span><b>'+esc(o.shipping_carrier||'—')+'</b></div><div class="line"><span>رقم التتبع</span><b>'+esc(o.tracking_number||'—')+'</b></div></div>':'<div class="notice" style="margin-top:12px">سيظهر رقم التتبع هنا فور إضافته من الإدارة.</div>')+
      (canCancel?'<button class="secondary danger" id="cancelOrderBtn" style="width:100%;margin-top:10px">إلغاء الطلب</button>':'')+
      (o.status==='delivered'?'<button class="secondary" id="returnBtn" style="width:100%;margin-top:10px">طلب إرجاع / استبدال</button>':''));
    $('[data-close]',els.panel).onclick=closeSheet;
    $('#reorderBtn',els.panel).onclick=()=>reorder(o);
    const cb=$('#cancelOrderBtn',els.panel);if(cb)cb.onclick=()=>cancelOrder(o);
    const rb=$('#returnBtn',els.panel); if(rb)rb.onclick=()=>returnRequest(o.id);
  }

  function reorder(o){
    let added=0,skipped=0;
    for(const item of o.order_items||[]){
      const p=state.products.find(x=>x.id===item.product_id),v=p?.product_variants.find(x=>x.id===item.variant_id&&x.is_active&&x.stock_quantity>0);
      if(!p||!v){skipped++;continue}
      const existing=state.cart.find(x=>x.variantId===v.id),qty=Math.min(Number(item.quantity||1),Number(v.stock_quantity||0));
      if(existing)existing.qty=Math.min(Number(v.stock_quantity||0),existing.qty+qty);
      else state.cart.push({variantId:v.id,productId:p.id,productName:p.name,variantTitle:v.title,price:Number(v.price??p.base_price),qty,image:productImage(p)});
      added++;
    }
    saveLocal();
    if(added){toast(skipped?'أضفت المتاح وتجاوزت المنتجات غير المتوفرة':'تمت إضافة الطلب السابق إلى السلة');openCart()}
    else toast('لا توجد منتجات متاحة من هذا الطلب الآن');
  }

  async function cancelOrder(order){
    if(!confirm('هل تريد إلغاء الطلب وإعادة المنتجات إلى المخزون؟'))return;
    if(order.payment_method==='online'){
      const {error}=await sb.functions.invoke('cancel-stripe-checkout',{body:{order_id:order.id}});
      if(error){toast('تعذر إلغاء جلسة الدفع الآن. حاول مجددًا.');return}
    }else{
      const {error}=await sb.rpc('cancel_my_order',{p_order_id:order.id});
      if(error){toast(error.message);return}
    }
    closeSheet();toast('تم إلغاء الطلب');await loadOrders();
  }

  function returnRequest(orderId){
    openSheet('<div class="sheethead"><h2 style="margin:0">طلب إرجاع</h2><button class="close" data-close>×</button></div><p class="muted">اشرح سبب الإرجاع أو الاستبدال. الطلب يذهب إلى لوحة الإدارة للمراجعة.</p><textarea class="field" id="returnReason" rows="5" placeholder="سبب الإرجاع"></textarea><button class="primary" id="sendReturn">إرسال الطلب</button><div id="returnMsg" class="tiny"></div>');
    $('[data-close]',els.panel).onclick=closeSheet;
    $('#sendReturn',els.panel).onclick=async()=>{
      const reason=$('#returnReason',els.panel).value.trim(),m=$('#returnMsg',els.panel);
      if(!reason){m.textContent='اكتب السبب أولًا.';return}
      const {error}=await sb.from('returns').insert({order_id:orderId,user_id:state.session.user.id,reason});
      if(error){m.textContent=error.message;m.className='danger';return}
      openSheet('<div style="text-align:center;padding:20px"><div class="mark" style="margin:auto"></div><h2>تم إرسال طلب الإرجاع</h2><p class="muted">سنضيف لاحقًا إشعارات وتحديثات حالة الإرجاع هنا.</p><button class="primary" data-close>حسنًا</button></div>');
      $('[data-close]',els.panel).onclick=closeSheet;
    };
  }

  function renderAccount(){
    if(!els.accountContent)return;
    if(!state.session){
      els.accountContent.innerHTML='<div class="card account-card"><h3>حساب مَخْرَج</h3><p class="muted">احفظ طلباتك وعناوينك ومفضلاتك على حسابك.</p><button class="primary" id="accLogin">تسجيل الدخول</button> <button class="secondary" id="accSignup">إنشاء حساب</button></div>';
      $('#accLogin').onclick=()=>openAuth('login');$('#accSignup').onclick=()=>openAuth('signup');return;
    }
    els.accountContent.innerHTML='<div class="card account-card"><div class="tiny">مسجل الدخول</div><h3>'+esc(state.profile?.full_name||state.session.user.email)+'</h3><div class="muted">'+esc(state.session.user.email)+'</div><div class="account-actions"><button class="secondary" id="accProfile">بياناتي</button><button class="secondary" id="accOrders">طلباتي</button><button class="secondary" id="accFavs">المفضلة</button><button class="secondary" id="accAddresses">عناويني</button><button class="secondary" id="accNotifications">الإشعارات</button><button class="secondary" id="accSupport">الدعم</button>'+(state.profile?.role==='admin'?'<button class="primary" id="accSeller">لوحة البائع</button>':'')+'<button class="secondary" id="accLogout">تسجيل الخروج</button></div></div><div id="favArea"></div><div id="accountExtra"></div>';
    $('#accProfile').onclick=profileModal;
    $('#accOrders').onclick=()=>showView('orders');
    $('#accFavs').onclick=()=>renderFavArea();
    $('#accAddresses').onclick=()=>renderAddresses();
    $('#accNotifications').onclick=()=>renderNotifications();
    $('#accSupport').onclick=()=>renderSupport();
    const adminBtn=$('#accSeller'); if(adminBtn) adminBtn.onclick=()=>{location.href='seller.html';};
    $('#accLogout').onclick=async()=>{await sb.auth.signOut();state.session=null;state.profile=null;toast('تم تسجيل الخروج');renderAccount();};
  }

  function profileModal(){
    openSheet('<div class="sheethead"><h2 style="margin:0">بياناتي</h2><button class="close" data-close>×</button></div><div class="formgrid"><input class="field" id="profileName" placeholder="الاسم الكامل" value="'+esc(state.profile?.full_name||'')+'"><input class="field" id="profilePhone" placeholder="رقم الهاتف" inputmode="tel" value="'+esc(state.profile?.phone||'')+'"><button class="primary" id="saveProfile">حفظ</button><div id="profileMsg" class="tiny"></div></div>');
    $('[data-close]',els.panel).onclick=closeSheet;
    $('#saveProfile',els.panel).onclick=async()=>{
      const row={full_name:$('#profileName',els.panel).value.trim()||null,phone:$('#profilePhone',els.panel).value.trim()||null};
      const {error}=await sb.from('profiles').update(row).eq('id',state.session.user.id);
      if(error){$('#profileMsg',els.panel).textContent=error.message;$('#profileMsg',els.panel).className='danger';return}
      await loadProfile();closeSheet();renderAccount();toast('تم حفظ بياناتك');
    };
  }

  function renderFavArea(){
    const list=state.products.filter(p=>state.favs.has(p.id)),area=$('#favArea');
    area.innerHTML='<div class="section"><h2>المفضلة</h2><span class="tiny">'+list.length+'</span></div>'+(list.length?'<div class="grid">'+list.map(p=>'<article class="card account-card" data-favopen="'+p.id+'"><b>'+esc(p.name)+'</b><div class="price">'+money(minPrice(p))+'</div></article>').join('')+'</div>':'<div class="empty">لا توجد منتجات في المفضلة.</div>');
    $$('[data-favopen]',area).forEach(x=>x.onclick=()=>openProduct(x.dataset.favopen));
  }

  async function renderAddresses(){
    const area=$('#accountExtra'); if(!area)return;
    area.innerHTML='<div class="section"><h2>عناويني</h2><button class="secondary" id="newAddress">+ عنوان</button></div><div class="loading">جارٍ التحميل…</div>';
    const {data,error}=await sb.from('addresses').select('*').order('is_default',{ascending:false}).order('created_at',{ascending:false});
    if(error){area.innerHTML='<div class="error">تعذر تحميل العناوين.</div>';return}
    area.innerHTML='<div class="section"><h2>عناويني</h2><button class="secondary" id="newAddress">+ عنوان</button></div>'+
      ((data||[]).length?(data||[]).map(a=>'<div class="summary"><div class="line"><b>'+esc(a.label||'عنوان')+'</b>'+(a.is_default?' <span class="badge">افتراضي</span>':'')+'</div><div class="muted">'+esc(a.recipient_name)+' · '+esc(a.phone||'')+'<br>'+esc(a.line1)+' '+esc(a.line2||'')+'<br>'+esc(a.city)+' '+esc(a.state||'')+' '+esc(a.postal_code||'')+'</div><button class="secondary" data-address="'+a.id+'">تعديل</button></div>').join(''):'<div class="empty">لم تحفظ أي عنوان بعد.</div>');
    $('#newAddress',area).onclick=()=>addressModal();
    $$('[data-address]',area).forEach(b=>b.onclick=()=>addressModal((data||[]).find(a=>a.id===b.dataset.address)));
  }

  function addressModal(a=null){
    openSheet('<div class="sheethead"><h2 style="margin:0">'+(a?'تعديل العنوان':'عنوان جديد')+'</h2><button class="close" data-close>×</button></div><div class="formgrid"><input class="field" id="aLabel" placeholder="اسم العنوان: المنزل" value="'+esc(a?.label||'')+'"><input class="field" id="aName" placeholder="اسم المستلم" value="'+esc(a?.recipient_name||state.profile?.full_name||'')+'"><input class="field" id="aPhone" placeholder="الهاتف" inputmode="tel" value="'+esc(a?.phone||'')+'"><input class="field" id="aLine1" placeholder="العنوان" value="'+esc(a?.line1||'')+'"><input class="field" id="aLine2" placeholder="تفاصيل إضافية" value="'+esc(a?.line2||'')+'"><div class="line"><input class="field" id="aCity" placeholder="المدينة" value="'+esc(a?.city||'')+'"><input class="field" id="aState" placeholder="الولاية" value="'+esc(a?.state||'')+'"></div><input class="field" id="aZip" placeholder="ZIP Code" value="'+esc(a?.postal_code||'')+'"><label class="tiny"><input type="checkbox" id="aDefault" '+(a?.is_default?'checked':'')+'> اجعله العنوان الافتراضي</label><button class="primary" id="saveAddressBtn">حفظ العنوان</button>'+(a?'<button class="secondary" id="deleteAddressBtn">حذف العنوان</button>':'')+'<div id="addressMsg" class="tiny"></div></div>');
    $('[data-close]',els.panel).onclick=closeSheet;
    $('#saveAddressBtn',els.panel).onclick=async()=>{
      const row={user_id:state.session.user.id,label:$('#aLabel',els.panel).value.trim()||null,recipient_name:$('#aName',els.panel).value.trim(),phone:$('#aPhone',els.panel).value.trim()||null,line1:$('#aLine1',els.panel).value.trim(),line2:$('#aLine2',els.panel).value.trim()||null,city:$('#aCity',els.panel).value.trim(),state:$('#aState',els.panel).value.trim()||null,postal_code:$('#aZip',els.panel).value.trim()||null,country:'US',is_default:$('#aDefault',els.panel).checked};
      const m=$('#addressMsg',els.panel); if(!row.recipient_name||!row.line1||!row.city){m.textContent='الاسم والعنوان والمدينة مطلوبة.';m.className='danger';return}
      const q=a?sb.from('addresses').update(row).eq('id',a.id):sb.from('addresses').insert(row);
      const {error}=await q;if(error){m.textContent=error.message;m.className='danger';return}
      closeModal();renderAddresses();toast('تم حفظ العنوان');
    };
    const del=$('#deleteAddressBtn',els.panel);if(del)del.onclick=async()=>{const {error}=await sb.from('addresses').delete().eq('id',a.id);if(error){$('#addressMsg',els.panel).textContent=error.message;return}closeSheet();renderAddresses();};
  }

  async function renderSupport(){
    const area=$('#accountExtra'); if(!area)return;
    area.innerHTML='<div class="section"><h2>الدعم</h2><button class="secondary" id="newTicket">+ تذكرة جديدة</button></div><div class="loading">جارٍ التحميل…</div>';
    const {data,error}=await sb.from('support_tickets').select('id,subject,status,priority,order_id,created_at,updated_at').order('updated_at',{ascending:false});
    if(error){area.innerHTML='<div class="error">تعذر تحميل الدعم.</div>';return}
    const rows=data||[];
    area.innerHTML='<div class="section"><h2>الدعم</h2><button class="secondary" id="newTicket">+ تذكرة جديدة</button></div>'+
      (rows.length?rows.map(t=>'<button class="summary" data-ticket="'+t.id+'" style="width:100%;text-align:right;color:#fff"><div class="line"><b>'+esc(t.subject)+'</b><span class="badge">'+supportStatus(t.status)+'</span></div><div class="tiny">'+new Date(t.updated_at).toLocaleString('ar-US')+'</div></button>').join(''):'<div class="empty">لا توجد تذاكر دعم.</div>');
    $('#newTicket',area).onclick=newTicketModal;
    $$('[data-ticket]',area).forEach(b=>b.onclick=()=>openTicket(b.dataset.ticket));
  }

  async function newTicketModal(){
    const {data:orders}=await sb.from('orders').select('id,order_number').order('created_at',{ascending:false}).limit(20);
    openSheet('<div class="sheethead"><h2 style="margin:0">تذكرة دعم جديدة</h2><button class="close" data-close>×</button></div><div class="formgrid"><input class="field" id="ticketSubject" placeholder="عنوان المشكلة"><select class="field" id="ticketOrder"><option value="">بدون طلب مرتبط</option>'+(orders||[]).map(o=>'<option value="'+o.id+'">MK-'+String(o.order_number).padStart(6,'0')+'</option>').join('')+'</select><textarea class="field" id="ticketMessage" rows="5" placeholder="اشرح ما الذي تحتاج مساعدتنا فيه"></textarea><button class="primary" id="createTicketBtn">إرسال</button><div id="ticketMsg" class="tiny"></div></div>');
    $('[data-close]',els.panel).onclick=closeSheet;
    $('#createTicketBtn',els.panel).onclick=async()=>{
      const subject=$('#ticketSubject',els.panel).value.trim(),message=$('#ticketMessage',els.panel).value.trim(),orderId=$('#ticketOrder',els.panel).value||null,m=$('#ticketMsg',els.panel);
      const {data,error}=await sb.rpc('create_support_ticket',{p_subject:subject,p_message:message,p_order_id:orderId});
      if(error){m.textContent=error.message;m.className='danger';return}
      toast('تم إرسال التذكرة');openTicket(data);
    };
  }

  async function openTicket(ticketId){
    state.activeSupportTicket=ticketId;
    const [{data:ticket,error:tErr},{data:messages,error:mErr}]=await Promise.all([
      sb.from('support_tickets').select('*').eq('id',ticketId).single(),
      sb.from('support_messages').select('id,sender_user_id,message,is_staff,source_language,created_at').eq('ticket_id',ticketId).order('created_at')
    ]);
    if(tErr||mErr){toast('تعذر فتح التذكرة');return}
    const target=localStorage.getItem('makhraj-support-language')||window.MakhrajI18n?.language||'ar';
    openSheet('<div class="sheethead"><div><div class="tiny">'+supportStatus(ticket.status)+'</div><h2 style="margin:2px 0">'+esc(ticket.subject)+'</h2></div><button class="close" data-close>×</button></div>'+
      '<label class="tiny">لغة الترجمة<select id="supportTranslationLanguage" class="field">'+supportLanguageOptions(target)+'</select></label><div>'+
      (messages||[]).map(m=>'<div class="summary support-message '+(m.is_staff?'staff':'customer')+'"><div class="tiny">'+(m.is_staff?'دعم مَخْرَج':'أنت')+' · '+new Date(m.created_at).toLocaleString()+'</div><div class="original-message">'+esc(m.message)+'</div><div class="translation-box" data-translation="'+m.id+'"></div></div>').join('')+
      '</div>'+(ticket.status!=='closed'&&ticket.status!=='resolved'?'<div class="formgrid"><textarea class="field" id="replyMessage" rows="3" placeholder="اكتب ردك"></textarea><button class="primary" id="sendReply">إرسال الرد</button><div id="replyMsg" class="tiny"></div></div>':'<div class="notice">هذه التذكرة مغلقة.</div>'));
    $('[data-close]',els.panel).onclick=closeSheet;
    $('#supportTranslationLanguage',els.panel).onchange=e=>{localStorage.setItem('makhraj-support-language',e.target.value);openTicket(ticketId)};
    (messages||[]).forEach(m=>translateSupportMessage(m,target));
    const btn=$('#sendReply',els.panel);if(btn)btn.onclick=async()=>{
      const text=$('#replyMessage',els.panel).value.trim(),m=$('#replyMsg',els.panel);if(!text){m.textContent='اكتب رسالة أولًا.';return}
      const {error}=await sb.from('support_messages').insert({
        ticket_id:ticketId,
        sender_user_id:state.session.user.id,
        message:text,
        is_staff:false,
        source_language:'auto'
      });
      if(error){m.textContent=error.message;m.className='danger';return}
      openTicket(ticketId);
    };
  }

  async function translateSupportMessage(message,target){
    const box=$('[data-translation="'+message.id+'"]',els.panel); if(!box)return;
    if(message.source_language===target){box.innerHTML='';return}
    box.innerHTML='<div class="translation-label">جارٍ الترجمة…</div>';
    const {data,error}=await sb.functions.invoke('translate-message',{body:{message_id:message.id,target_language:target}});
    if(!box.isConnected)return;
    if(error||!data?.translated_text){box.innerHTML='<div class="translation-error">تعذر الترجمة الآن</div>';return}
    if(String(data.translated_text).trim()===String(message.message).trim()){box.innerHTML='';return}
    box.innerHTML='<div class="translation-label">الترجمة</div><div class="translated-message">'+esc(data.translated_text)+'</div>';
    window.MakhrajI18n?.apply(box);
  }

  function supportStatus(s){return({open:'مفتوحة',waiting_customer:'بانتظارك',in_progress:'قيد المعالجة',resolved:'تم الحل',closed:'مغلقة'})[s]||s}

  async function renderNotifications(){
    const area=$('#accountExtra'); if(!area)return;
    area.innerHTML='<div class="section"><h2>الإشعارات</h2><span class="tiny">تحديثات طلباتك وإرجاعاتك</span></div><div class="loading">جارٍ التحميل…</div>';
    const {data,error}=await sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(50);
    if(error){area.innerHTML='<div class="error">تعذر تحميل الإشعارات.</div>';return}
    const rows=data||[];
    area.innerHTML='<div class="section"><h2>الإشعارات</h2><button class="secondary" id="readAll">تعليم الكل كمقروء</button></div>'+
      (rows.length?rows.map(n=>'<div class="summary" style="'+(!n.read_at?'border-color:#f2d27b55':'')+'"><div class="line"><b>'+esc(n.title)+'</b><span class="tiny">'+new Date(n.created_at).toLocaleString('ar-US')+'</span></div><div class="muted">'+esc(n.body||'')+'</div></div>').join(''):'<div class="empty">لا توجد إشعارات بعد.</div>');
    const btn=$('#readAll',area);if(btn)btn.onclick=async()=>{await sb.from('notifications').update({read_at:new Date().toISOString()}).is('read_at',null);renderNotifications();};
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
      const stock=totalStock(p),price=minPrice(p),hay=(p.name+' '+(p.description||'')+' '+(p.categories?.name||'')+' '+(p.brand||'')+' '+(p.tags||[]).join(' ')+' '+Object.entries(p.specifications||{}).map(x=>x.join(' ')).join(' ')).toLowerCase();
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
  function paymentMethodLabel(s){return({test:'تجريبي',cash_on_delivery:'عند الاستلام',online:'دفع إلكتروني'})[s]||s}
  function paymentLabel(s){return({unpaid:'غير مدفوع',authorized:'مصرح',paid:'مدفوع',partially_refunded:'استرداد جزئي',refunded:'مسترد',failed:'فشل الدفع'})[s]||s}

  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
  init().catch(err=>{console.error(err);els.grid.innerHTML='<div class="error">حدث خطأ أثناء تشغيل المتجر.</div>';});
})();