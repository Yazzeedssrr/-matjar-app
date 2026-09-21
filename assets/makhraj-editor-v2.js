/* MAKHRAJ product editor. Local drafts are not a cloud backup. */
(() => {
  'use strict';
  const FIELDS=['name','price','comparePrice','costPrice','stock','category','brand','sku','barcode','weight','partNumber','compatibility','position','condition','description'];
  const $=id=>document.getElementById(id);
  const uid=()=>crypto.randomUUID();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const maxMoney=9999999.99;
  function moneyValue(raw,optional=false){
    const s=String(raw??'').trim();
    if(!s&&optional)return null;
    if(!/^\d{1,7}(\.\d{1,2})?$/.test(s)||!Number.isFinite(Number(s))||Number(s)>maxMoney)throw Error('أدخل مبلغًا صحيحًا بخانتين عشريتين كحد أقصى.');
    return Number(s).toFixed(2);
  }
  function whole(raw,optional=false){
    const s=String(raw??'').trim();if(!s&&optional)return null;
    if(!/^\d{1,7}$/.test(s)||Number(s)>1000000)throw Error('الكمية والوزن يجب أن يكونا أرقامًا صحيحة غير سالبة.');
    return Number(s);
  }
  class DraftStore {
    constructor(scope){this.scope=scope;this.key='makhraj-product-draft-v2:'+scope;this.queue=Promise.resolve();this.db=null;}
    async open(){
      if(this.db)return this.db;
      this.db=await new Promise((resolve,reject)=>{
        const r=indexedDB.open('makhraj-editor-drafts-v2',1);
        r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('drafts'))r.result.createObjectStore('drafts',{keyPath:'scope'});};
        r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('draft_storage_blocked'));
      });return this.db;
    }
    text(snapshot){
      const meta={...snapshot,files:snapshot.files.map(f=>({id:f.id,name:f.name,uploaded:f.uploaded,path:f.path}))};
      localStorage.setItem(this.key,JSON.stringify(meta));
    }
    write(snapshot){
      this.text(snapshot);
      this.queue=this.queue.catch(()=>{}).then(async()=>{
        const db=await this.open();
        await new Promise((resolve,reject)=>{
          const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({...snapshot,scope:this.scope});
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('draft_write_aborted'));
        });
      });return this.queue;
    }
    async read(){
      let meta=null,record=null;
      try{meta=JSON.parse(localStorage.getItem(this.key)||'null');}catch{}
      try{const db=await this.open();record=await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(this.scope);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}catch{}
      if(!meta)return record;
      if(record&&record.updatedAt>=meta.updatedAt)return record;
      const blobs=new Map((record?.files||[]).map(f=>[f.id,f.blob]));
      return {...meta,files:(meta.files||[]).map(f=>({...f,blob:blobs.get(f.id)}))};
    }
    async clear(){
      await this.queue.catch(()=>{});localStorage.removeItem(this.key);
      try{const db=await this.open();await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').delete(this.scope);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch{}
    }
  }
  async function prepareImage(file){
    if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw Error('اختر صورة بحجم لا يتجاوز 20MB.');
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(Error('تعذر قراءة الصورة. جرّب نسخة JPG أو PNG، خصوصًا لصور HEIC.'));x.src=url;});
      if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>80000000)throw Error('أبعاد الصورة كبيرة جدًا. اختر نسخة أصغر.');
      const ratio=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('تعذر تجهيز الصورة.');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
      if(!blob||blob.size>5*1024*1024)throw Error('لم يمكن تصغير الصورة للحجم المسموح. اختر صورة أصغر.');
      return {id:uid(),name:file.name,blob,uploaded:false};
    }finally{URL.revokeObjectURL(url);}
  }
  function friendly(error){
    const s=String(error?.message||error||'');
    if(/changed_reload/.test(s))return 'تغيّرت بيانات المنتج أو مخزونه منذ فتحه. لم نكتب فوق التعديل الأحدث. احتفظ بمسودتك ثم افتح المنتج مجددًا للمراجعة.';
    if(/unique|duplicate|23505/i.test(s))return 'رقم SKU أو الباركود مستخدم بالفعل. عدّله ثم أعد المحاولة.';
    if(/publish_requires_image/.test(s))return 'النشر يحتاج صورة واحدة على الأقل وكمية متوفرة. يمكنك الحفظ كمسودة.';
    if(/admin_required|42501|permission/i.test(s))return 'يلزم تسجيل الدخول بحساب الإدارة.';
    if(/fetch|network|timeout/i.test(s))return 'انقطع الاتصال. بقيت المسودة؛ أعد المحاولة بنفس الزر بعد عودة الاتصال.';
    return s||'تعذر الحفظ. بقيت المسودة للمراجعة.';
  }
  function create({client,userId,onSaved,onEdit}){
    const sb=client,scope=new URL(window.MAKHRAJ_CONFIG.supabaseUrl).host+':'+userId,store=new DraftStore(scope);
    let doc=null,busy=false,dirty=false,rev=0,timer=null,restorable=null,previews=[];
    function blank(){return {schema:2,productId:uid(),variantId:uid(),expectedProduct:null,expectedVariant:null,existingImages:[],specs:{},fields:{stock:'1',condition:'جديد'},files:[],pending:null,isNew:true};}
    function status(text,kind=''){const e=$('formMsg');e.textContent=text;e.className='msg '+kind;}
    function notice(text,kind=''){const e=$('draftStatus');if(e){e.textContent=text;e.className='draft-status '+kind;}}
    function fields(){return Object.fromEntries(FIELDS.map(id=>[id,$(id)?.value||'']));}
    function snapshot(){return {...doc,fields:fields(),updatedAt:Date.now(),dirty,files:doc.files.map(f=>({...f}))};}
    async function persist(){
      if(!doc||!dirty)return;
      const captured=rev,s=snapshot();
      try{await store.write(s);if(captured===rev)notice('حُفظت مسودة على هذا الجهاز — لم تُنشر بعد.','ok');}
      catch{notice('تعذر تأمين المسودة محليًا. لا تغلق الصفحة قبل الحفظ في المتجر.','err');}
    }
    function changed(){if(!doc||busy)return;dirty=true;rev++;doc.pending=null;try{store.text(snapshot());}catch{}clearTimeout(timer);timer=setTimeout(persist,300);notice('جارٍ حفظ المسودة محليًا…');updateProfit();}
    function updateProfit(){
      const p=Number($('price').value),raw=$('costPrice').value,c=Number(raw),out=$('unitProfitPreview');if(!out)return;
      out.textContent=raw!==''&&Number.isFinite(p)&&p>0&&Number.isFinite(c)?'$'+(p-c).toFixed(2)+' · '+((p-c)/p*100).toFixed(0)+'%':'—';
    }
    function lock(value){busy=value;for(const id of [...FIELDS,'photos','saveDraftBtn','publishBtn','resetProductBtn','restoreDraftBtn','discardDraftBtn','editorVariant'])if($(id))$(id).disabled=value;}
    function renderPhotos(){
      previews.forEach(URL.revokeObjectURL);previews=[];
      const old=$('existingPhotos');old.replaceChildren();
      for(const image of doc.existingImages){const img=document.createElement('img');img.src=image.url;img.alt='صورة محفوظة';img.loading='lazy';old.append(img);}
      const box=$('photoPreview');box.replaceChildren();
      for(const file of doc.files){
        const tile=document.createElement('div');tile.className='draft-photo';
        if(file.blob){const url=URL.createObjectURL(file.blob);previews.push(url);const img=document.createElement('img');img.src=url;img.alt=file.name;tile.append(img);}
        else{const text=document.createElement('span');text.textContent='أعد اختيار الصورة: '+file.name;tile.append(text);}
        const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='إزالة من المسودة';
        button.onclick=()=>{if(busy)return;doc.files=doc.files.filter(f=>f.id!==file.id);changed();renderPhotos();};tile.append(button);box.append(tile);
      }
    }
    function fill(){
      for(const id of FIELDS)if($(id))$(id).value=doc.fields[id]??'';
      $('formTitle').textContent=doc.isNew?'إضافة منتج':'تعديل المنتج';
      $('photos').value='';renderPhotos();updateProfit();
      if(!doc.isNew&&$('editorVariant'))$('editorVariant').value=doc.variantId;
    }
    async function categories(){
      const selected=$('category').value||doc?.fields.category;
      const {data,error}=await sb.from('categories').select('id,name').eq('is_active',true).order('sort_order');if(error)throw error;
      $('category').replaceChildren();for(const c of data||[]){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;$('category').append(o);}
      if(selected)$('category').value=selected;
      if(!$('category').value&&$('category').options.length)$('category').selectedIndex=0;
      return data||[];
    }
    async function init(){
      const tools=document.createElement('div');tools.className='draft-tools';tools.innerHTML='<div id="draftStatus" class="draft-status" aria-live="polite">المحفوظ محليًا ليس بديلًا عن الحفظ في المتجر.</div><div class="actions"><button type="button" id="restoreDraftBtn" class="secondary hidden">استرجاع المسودة</button><button type="button" id="discardDraftBtn" class="secondary hidden">حذف المسودة المحلية</button></div><div class="hint">المسودة خاصة بهذا الحساب على هذا الجهاز. لا تمسح بيانات Safari قبل حفظ عملك في المتجر.</div>';
      $('formTitle').closest('.panel').insertBefore(tools,$('formTitle').closest('.section-head').nextSibling);
      const selector=document.createElement('label');selector.id='variantPicker';selector.className='hidden';selector.textContent='خيار المنتج';const select=document.createElement('select');select.id='editorVariant';select.className='field';selector.append(select);tools.after(selector);
      doc=blank();await categories();doc.fields.category=$('category').value;fill();
      restorable=await store.read();
      if(restorable?.schema===2&&restorable.dirty){$('restoreDraftBtn').classList.remove('hidden');$('discardDraftBtn').classList.remove('hidden');notice('وجدنا مسودة سابقة. اضغط «استرجاع المسودة» قبل بدء منتج جديد.');}
      $('restoreDraftBtn').onclick=async()=>{
        if(dirty&&!confirm('استبدال البيانات الحالية بالمسودة السابقة؟'))return;
        doc=restorable;dirty=true;rev++;await categories();fill();
        $('restoreDraftBtn').classList.add('hidden');notice(doc.files.some(f=>!f.blob)?'استُرجعت النصوص؛ بعض الصور تحتاج إعادة اختيار.':'استُرجعت المسودة والصور المتاحة على هذا الجهاز.','ok');
      };
      $('discardDraftBtn').onclick=async()=>{if(!confirm('حذف المسودة المحلية فقط؟ لن يُحذف أي منتج من المتجر.'))return;await store.clear();restorable=null;$('restoreDraftBtn').classList.add('hidden');$('discardDraftBtn').classList.add('hidden');notice('حُذفت المسودة المحلية فقط.');};
      FIELDS.forEach(id=>$(id)?.addEventListener('input',changed));
      $('photos').accept='image/*';$('photos').multiple=true;
      $('photos').onchange=async e=>{
        const files=[...e.target.files];if(!files.length)return;
        if(doc.files.length+files.length>6||doc.existingImages.length+doc.files.length+files.length>12){status('يمكن إضافة 6 صور جديدة في الدفعة، و12 صورة إجمالًا.','err');e.target.value='';return;}
        lock(true);status('جارٍ تجهيز الصور…');
        try{const ready=[];for(const file of files)ready.push(await prepareImage(file));doc.files.push(...ready);}
        catch(error){status(friendly(error),'err');}
        finally{lock(false);e.target.value='';changed();renderPhotos();await persist();}
      };
      $('editorVariant').onchange=e=>edit(doc.productId,e.target.value);
      $('saveDraftBtn').onclick=()=>save('draft');$('publishBtn').onclick=()=>save('active');$('resetProductBtn').onclick=newProduct;
      window.addEventListener('beforeunload',e=>{if(dirty){try{store.text(snapshot());}catch{}e.preventDefault();e.returnValue='';}});
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist();});
      window.addEventListener('offline',()=>notice('أنت غير متصل. يمكنك متابعة المسودة؛ الحفظ في المتجر يحتاج اتصالًا.','err'));
      window.addEventListener('online',()=>notice(dirty?'عاد الاتصال. اضغط الحفظ لإكمال العمل.':'عاد الاتصال.'));
    }
    async function newProduct(){
      if(busy)return;if(dirty&&!confirm('بدء منتج جديد سيستبدل المسودة الحالية. هل حفظت ما تحتاجه؟'))return;
      clearTimeout(timer);await store.clear();doc=blank();dirty=false;rev++;doc.fields.category=$('category').value;fill();$('variantPicker').classList.add('hidden');status('');notice('منتج جديد — سيُحفظ عملك محليًا أثناء الكتابة.');
      $('restoreDraftBtn').classList.add('hidden');$('discardDraftBtn').classList.add('hidden');
    }
    async function edit(productId,variantId=null){
      if(busy)return;if(dirty&&!confirm('فتح المنتج من الخادم سيستبدل المسودة الحالية. متابعة؟'))return;
      lock(true);
      try{
        const {data:p,error}=await sb.from('products').select('*,product_images(*),product_variants(*)').eq('id',productId).single();if(error)throw error;
        const variants=[...(p.product_variants||[])].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
        const v=variants.find(x=>x.id===variantId)||variants[0];
        if(!v)throw Error('المنتج لا يحتوي خيارًا قابلًا للتعديل. احتفظ ببياناته وراجع الإدارة.');
        const costRes=await sb.from('variant_costs').select('cost_price').eq('variant_id',v.id).maybeSingle();
        const s=p.specifications||{};
        doc={...blank(),isNew:false,productId:p.id,variantId:v.id,expectedProduct:p.updated_at,expectedVariant:v.updated_at,existingImages:(p.product_images||[]).sort((a,b)=>a.sort_order-b.sort_order),specs:s,fields:{name:p.name,price:String(v.price??p.base_price),comparePrice:p.compare_at_price??'',costPrice:costRes.data?.cost_price??'',stock:String(v.stock_quantity),category:p.category_id,brand:p.brand??'',sku:v.sku,barcode:v.barcode??'',weight:v.weight_grams??'',partNumber:s.part_number??'',compatibility:s.compatibility??s.compatible_years??'',position:s.position??'',condition:s.condition||'جديد',description:p.description??''}};
        dirty=false;rev++;await categories();fill();
        $('editorVariant').replaceChildren();for(const item of variants){const o=document.createElement('option');o.value=item.id;o.textContent=item.title+' · '+item.sku;$('editorVariant').append(o);}$('editorVariant').value=v.id;$('variantPicker').classList.toggle('hidden',variants.length<2);
        status(costRes.error?'لم نستطع قراءة التكلفة؛ ترك الحقل فارغًا يحافظ على التكلفة القديمة.':'تم تحميل أحدث بيانات المنتج.');notice('عند الحفظ نتحقق أن المنتج والمخزون لم يتغيرا في مكان آخر.');onEdit?.();
      }catch(error){status(friendly(error),'err');}finally{lock(false);}
    }
    function buildRequest(statusValue){
      const f=fields(),price=moneyValue(f.price),cost=moneyValue(f.costPrice,true),compare=moneyValue(f.comparePrice,true),stock=whole(f.stock),weight=whole(f.weight,true);
      if(f.name.trim().length<2||f.name.trim().length>200||!f.category||Number(price)<=0)throw Error('اكتب اسم المنتج والسعر والقسم.');
      if(compare!==null&&Number(compare)<Number(price))throw Error('السعر قبل الخصم لا يمكن أن يكون أقل من سعر البيع.');
      if(statusValue==='active'&&!doc.existingImages.length&&!doc.files.length)throw Error('أضف صورة قبل النشر، أو احفظ كمسودة.');
      if(doc.files.some(file=>!file.blob&&!file.uploaded))throw Error('أعد اختيار الصور غير المتاحة في المسودة قبل الحفظ.');
      const specs={...doc.specs,condition:f.condition,part_number:f.partNumber.trim(),compatibility:f.compatibility.trim(),position:f.position.trim()};
      const variant={id:doc.variantId,sku:f.sku.trim()||('MK-'+doc.variantId),title:f.condition,price,stock_quantity:String(stock),barcode:f.barcode.trim()||null,weight_grams:weight===null?null:String(weight)};
      if(cost!==null)variant.cost_price=cost;
      doc.files.forEach(file=>{file.path||='products/'+doc.productId+'/'+file.id+'.jpg';});
      return {p_request_id:uid(),p_product:{id:doc.productId,category_id:f.category,name:f.name.trim(),description:f.description.trim(),brand:f.brand.trim(),compare_at_price:compare,status:statusValue,specifications:specs},p_variant:variant,p_images:doc.files.map(file=>({id:file.id,path:file.path})),p_expected_product_updated_at:doc.expectedProduct,p_expected_variant_updated_at:doc.expectedVariant};
    }
    async function save(statusValue){
      if(busy)return;if(!navigator.onLine){status('لا يوجد اتصال. بقيت المسودة محليًا؛ أعد الحفظ عند عودة الإنترنت.','err');return;}
      let request;
      try{request=doc.pending?.p_product.status===statusValue?doc.pending:buildRequest(statusValue);}catch(error){status(friendly(error),'err');return;}
      doc.pending=request;dirty=true;lock(true);status('جارٍ حفظ الصور وبيانات المنتج…');await persist();
      try{
        for(let i=0;i<doc.files.length;i++){
          const file=doc.files[i];if(file.uploaded)continue;
          status('رفع الصورة '+(i+1)+' من '+doc.files.length+'…');
          const {error}=await sb.storage.from('product-images').upload(file.path,file.blob,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
          if(error&&!/already exists|duplicate/i.test(error.message||''))throw error;
          file.uploaded=true;await persist();
        }
        status('جارٍ حفظ المنتج والمخزون والتكلفة معًا…');
        const {data,error}=await sb.rpc('admin_save_product_v2',request);if(error)throw error;
        if(!data?.product_id)throw Error('لم يصل تأكيد الحفظ. أعد المحاولة لاسترجاع النتيجة دون إنشاء منتج آخر.');
        const pid=data.product_id;dirty=false;clearTimeout(timer);await store.clear();restorable=null;
        doc.expectedProduct=data.product_updated_at;doc.expectedVariant=data.variant_updated_at;doc.pending=null;doc.isNew=false;doc.files=[];
        $('restoreDraftBtn').classList.add('hidden');$('discardDraftBtn').classList.add('hidden');
        lock(false);await edit(pid,data.variant_id);await onSaved?.();
        status(statusValue==='active'?'تم الحفظ والنشر في المتجر.':'تم حفظ المسودة في قاعدة بيانات المتجر.','ok');notice('تم الحفظ في المتجر، وليس على هذا الجهاز فقط.','ok');
      }catch(error){await persist();status(friendly(error),'err');}
      finally{lock(false);}
    }
    async function exportCatalog(){
      const button=$('exportCatalogBtn');if(button)button.disabled=true;
      try{
        const tables=['products','product_variants','product_images','product_costs','variant_costs','categories'],rows={};
        for(const table of tables){rows[table]=[];const key=table==='product_costs'?'product_id':table==='variant_costs'?'variant_id':'id';for(let start=0;;start+=500){const {data,error}=await sb.from(table).select('*').order(key).range(start,start+499);if(error)throw error;rows[table].push(...data);if(data.length<500)break;}}
        const file={format:'makhraj-catalog-export-v1',exported_at:new Date().toISOString(),project:new URL(window.MAKHRAJ_CONFIG.supabaseUrl).host,notice:'Catalog metadata and image URLs only. Image files, accounts, orders and message history are NOT included. Contains private purchase costs. Keep privately.',tables:rows};
        const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='makhraj-catalog-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
        status('تم تصدير بيانات المنتجات وروابط الصور. الملف ليس نسخة كاملة من الصور والطلبات.','ok');
      }catch(error){status('تعذر التصدير: '+friendly(error),'err');}finally{if(button)button.disabled=false;}
    }
    return {init,edit,newProduct,save,exportCatalog,refreshCategories:categories,flush:persist,get dirty(){return dirty;},get busy(){return busy;}};
  }
  window.MakhrajEditor={create,prepareImage,moneyValue,whole,DraftStore};
})();
