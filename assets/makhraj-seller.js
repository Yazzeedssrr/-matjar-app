(() => {
  'use strict';
  const cfg = window.MAKHRAJ_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
  });
  const $ = (s,r=document)=>r.querySelector(s);
  const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slugify = s=>String(s||'').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
  const money = n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0));
  const state={session:null,profile:null,categories:[],products:[],files:[]};

  function msg(text,type=''){ const el=$('#formMsg'); el.textContent=text||''; el.className='msg '+type; }
  function showSeller(){ $('#gate').classList.add('hidden'); $('#seller').classList.remove('hidden'); }
  function showGate(html){ $('#seller').classList.add('hidden'); $('#gate').classList.remove('hidden'); $('#gateBody').innerHTML=html; }

  async function init(){
    const {data:{session}}=await sb.auth.getSession();
    state.session=session;
    if(!session){ renderLogin(); return; }
    await enter();
  }

  function renderLogin(){
    showGate('<input id="loginEmail" class="field" type="email" inputmode="email" placeholder="البريد الإلكتروني"><input id="loginPass" class="field" type="password" placeholder="كلمة المرور"><button id="loginBtn" class="primary">تسجيل الدخول</button><div id="loginMsg" class="msg"></div><div class="auth-note">استخدم حساب مَخْرَج الإداري نفسه.</div>');
    $('#loginBtn').onclick=login;
  }

  async function login(){
    const m=$('#loginMsg'),b=$('#loginBtn');
    b.disabled=true; m.textContent='جارٍ الدخول…';
    const {data,error}=await sb.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPass').value});
    b.disabled=false;
    if(error){m.textContent='تعذر الدخول: '+error.message;m.className='msg err';return;}
    state.session=data.session; await enter();
  }

  async function enter(){
    const {data,error}=await sb.from('profiles').select('id,full_name,role').eq('id',state.session.user.id).maybeSingle();
    if(error||!data||data.role!=='admin'){
      showGate('<div class="danger">هذا الحساب ليس لديه صلاحية إدارة المتجر.</div><button id="notAdminLogout" class="secondary">تسجيل الخروج</button>');
      $('#notAdminLogout').onclick=logout; return;
    }
    state.profile=data; showSeller();
    await Promise.all([loadCategories(),loadInventory()]);
    bind();
  }

  function bind(){
    $('#logoutBtn').onclick=logout;
    $('#refreshBtn').onclick=loadInventory;
    $('#resetBtn').onclick=resetForm;
    $('#saveDraftBtn').onclick=()=>saveProduct('draft');
    $('#publishBtn').onclick=()=>saveProduct('active');
    $('#photos').onchange=e=>{
      state.files=[...e.target.files].slice(0,6);
      const p=$('#photoPreview'); p.innerHTML='';
      state.files.forEach(f=>{const img=document.createElement('img');img.src=URL.createObjectURL(f);img.alt='معاينة';p.appendChild(img);});
    };
  }

  async function logout(){ await sb.auth.signOut(); state.session=null; renderLogin(); }

  async function loadCategories(){
    const {data,error}=await sb.from('categories').select('id,name,slug').order('sort_order');
    if(error)return;
    state.categories=data||[];
    const preferred=state.categories.find(c=>c.slug==='auto-parts');
    $('#category').innerHTML=state.categories.map(c=>'<option value="'+c.id+'" '+(preferred&&c.id===preferred.id?'selected':'')+'>'+esc(c.name)+'</option>').join('');
  }

  async function loadInventory(){
    const box=$('#inventory'); box.innerHTML='<div class="loading">جارٍ تحميل مخزونك…</div>';
    const {data,error}=await sb.from('products')
      .select('id,name,slug,status,base_price,updated_at,category_id,product_images(url,sort_order),product_variants(id,sku,title,price,stock_quantity,is_active)')
      .order('updated_at',{ascending:false});
    if(error){box.innerHTML='<div class="msg err">تعذر تحميل المنتجات: '+esc(error.message)+'</div>';return;}
    state.products=data||[];
    renderInventory();
  }

  function renderInventory(){
    const box=$('#inventory');
    const list=state.products.filter(p=>p.slug!=='makhraj-sandbox-stripe-test');
    if(!list.length){box.innerHTML='<div class="muted">لا توجد قطع منشورة بعد. أضف أول قطعة تملكها من النموذج أعلاه.</div>';return;}
    box.innerHTML=list.map(p=>{
      const imgs=[...(p.product_images||[])].sort((a,b)=>a.sort_order-b.sort_order);
      const v=(p.product_variants||[])[0];
      const stock=Number(v?.stock_quantity||0);
      const status=p.status==='active'?'منشور':p.status==='draft'?'مسودة':'مؤرشف';
      const image=imgs[0]?.url||'';
      return '<article class="item"><div class="thumb" '+(image?'style="background-image:url(\''+esc(image)+'\')"':'')+'>'+(image?'':'بدون صورة')+'</div><div><div><span class="badge '+(p.status==='active'?'active':'')+'">'+status+'</span></div><h3>'+esc(p.name)+'</h3><div class="meta"><span class="price">'+money(v?.price??p.base_price)+'</span> · الكمية '+stock+(v?.sku?' · '+esc(v.sku):'')+'</div><div class="item-actions">'+
        (p.status!=='active'?'<button data-publish="'+p.id+'">نشر</button>':'<button data-draft="'+p.id+'">إخفاء كمسودة</button>')+
        (p.status!=='archived'?'<button data-archive="'+p.id+'">أرشفة</button>':'')+
        '</div></div></article>';
    }).join('');
    box.querySelectorAll('[data-publish]').forEach(b=>b.onclick=()=>setStatus(b.dataset.publish,'active'));
    box.querySelectorAll('[data-draft]').forEach(b=>b.onclick=()=>setStatus(b.dataset.draft,'draft'));
    box.querySelectorAll('[data-archive]').forEach(b=>b.onclick=()=>setStatus(b.dataset.archive,'archived'));
  }

  async function setStatus(id,status){
    const {error}=await sb.from('products').update({status:status,updated_at:new Date().toISOString()}).eq('id',id);
    if(error){alert('تعذر التحديث: '+error.message);return;}
    await loadInventory();
  }

  function resetForm(){
    ['name','price','partNumber','sku','years','position','description'].forEach(id=>$('#'+id).value='');
    $('#stock').value='1'; $('#condition').value='جديد'; $('#photos').value=''; $('#photoPreview').innerHTML=''; state.files=[]; msg('');
  }

  async function saveProduct(status){
    const name=$('#name').value.trim();
    const price=Number($('#price').value);
    const stock=Math.max(0,Math.floor(Number($('#stock').value||0)));
    const categoryId=$('#category').value;
    const partNumber=$('#partNumber').value.trim();
    const years=$('#years').value.trim();
    const position=$('#position').value.trim();
    const condition=$('#condition').value;
    const description=$('#description').value.trim();
    if(!name||!Number.isFinite(price)||price<=0||!categoryId){msg('اكتب اسم القطعة والسعر والقسم.','err');return;}
    if(status==='active' && state.files.length===0){msg('للنشر المباشر أضف صورة واحدة على الأقل. يمكنك الحفظ كمسودة بدون صورة.','err');return;}
    for(const f of state.files){
      if(f.size>5*1024*1024){msg('إحدى الصور أكبر من 5MB. اختر نسخة أصغر.','err');return;}
      if(!['image/jpeg','image/png','image/webp','image/avif'].includes(f.type)){msg('صيغة صورة غير مدعومة. استخدم JPG أو PNG أو WebP.','err');return;}
    }

    const publish=$('#publishBtn'),draft=$('#saveDraftBtn');
    publish.disabled=draft.disabled=true; msg('جارٍ حفظ القطعة…');
    const stamp=Date.now().toString(36);
    const slug=(slugify(name)||'accord-part')+'-'+stamp.slice(-6);
    const manualSku=$('#sku').value.trim();
    const sku=manualSku||('ACC-'+stamp.toUpperCase());
    const specs={make:'Honda',model:'Accord',condition:condition};
    if(years)specs.compatible_years=years;
    if(position)specs.position=position;
    if(partNumber)specs.part_number=partNumber;
    const tags=['Honda','Accord',condition];
    if(years)tags.push(years);
    if(partNumber)tags.push(partNumber);

    try{
      const {data:product,error:e1}=await sb.from('products').insert({
        category_id:categoryId,name:name,slug:slug,description:description||null,status:status,
        base_price:price,featured:false,brand:'Honda',tags:tags,specifications:specs,
        need_tags:['قطع سيارات','قطع سيارة'],
        situations:['استبدال قطعة','صيانة سيارة'],
        benefit_summary:'قطعة متوفرة فعليًا من مخزون البائع',
        ideal_for:years?('Honda Accord '+years):'Honda Accord'
      }).select('id').single();
      if(e1)throw e1;

      const {error:e2}=await sb.from('product_variants').insert({
        product_id:product.id,sku:sku,title:condition,price:price,stock_quantity:stock,
        low_stock_threshold:1,attributes:specs,is_active:true
      });
      if(e2)throw e2;

      let order=0;
      for(const f of state.files){
        const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
        const path='products/'+product.id+'/'+String(order+1).padStart(2,'0')+'-'+Date.now()+'.'+ext;
        const {error:upErr}=await sb.storage.from('product-images').upload(path,f,{cacheControl:'3600',upsert:false,contentType:f.type});
        if(upErr)throw upErr;
        const {data:urlData}=sb.storage.from('product-images').getPublicUrl(path);
        const {error:imgErr}=await sb.from('product_images').insert({
          product_id:product.id,url:urlData.publicUrl,alt_text:name,sort_order:order
        });
        if(imgErr)throw imgErr;
        order++;
      }

      msg(status==='active'?'تم نشر القطعة في المتجر.':'تم حفظ القطعة كمسودة.','ok');
      resetForm();
      await loadInventory();
    }catch(e){
      console.error(e); msg('تعذر الحفظ: '+(e.message||'خطأ غير متوقع'),'err');
    }finally{
      publish.disabled=draft.disabled=false;
    }
  }

  init().catch(e=>{console.error(e);showGate('<div class="danger">تعذر تشغيل لوحة البائع.</div>');});
})();