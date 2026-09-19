(() => {
  'use strict';

  const LANGS = {
    ar: { label: 'العربية', dir: 'rtl' },
    en: { label: 'English', dir: 'ltr' },
    es: { label: 'Español', dir: 'ltr' },
    fr: { label: 'Français', dir: 'ltr' },
    tr: { label: 'Türkçe', dir: 'ltr' }
  };

  const D = {
    'مَخْرَج': {en:'MAKHRAJ',es:'MAKHRAJ',fr:'MAKHRAJ',tr:'MAKHRAJ'},
    'دائمًا هناك مخرج': {en:'There is always a way out',es:'Siempre hay una salida',fr:'Il y a toujours une issue',tr:'Her zaman bir çıkış vardır'},
    'الإدارة': {en:'Admin',es:'Administración',fr:'Administration',tr:'Yönetim'},
    'السلة': {en:'Cart',es:'Carrito',fr:'Panier',tr:'Sepet'},
    'الرئيسية': {en:'Home',es:'Inicio',fr:'Accueil',tr:'Ana Sayfa'},
    'بحث': {en:'Search',es:'Buscar',fr:'Rechercher',tr:'Ara'},
    'مخرجي': {en:'My solution',es:'Mi solución',fr:'Ma solution',tr:'Çözümüm'},
    'طلباتي': {en:'My orders',es:'Mis pedidos',fr:'Mes commandes',tr:'Siparişlerim'},
    'حسابي': {en:'My account',es:'Mi cuenta',fr:'Mon compte',tr:'Hesabım'},
    'تسوّق بثقة.': {en:'Shop with confidence.',es:'Compra con confianza.',fr:'Achetez en toute confiance.',tr:'Güvenle alışveriş yapın.'},
    'اختر ما تحتاجه.': {en:'Choose what you need.',es:'Elige lo que necesitas.',fr:'Choisissez ce dont vous avez besoin.',tr:'İhtiyacınızı seçin.'},
    'منتجات موجودة فعليًا، أسعار واضحة، دفع آمن، وطلبات يمكن متابعتها من حسابك.': {en:'Real in-stock products, clear prices, secure payments, and order tracking from your account.',es:'Productos realmente disponibles, precios claros, pagos seguros y seguimiento de pedidos desde tu cuenta.',fr:'Produits réellement en stock, prix clairs, paiements sécurisés et suivi des commandes depuis votre compte.',tr:'Gerçek stoklu ürünler, net fiyatlar, güvenli ödeme ve hesabınızdan sipariş takibi.'},
    'تصفّح المنتجات': {en:'Browse products',es:'Ver productos',fr:'Voir les produits',tr:'Ürünlere göz at'},
    'ساعدني أختار': {en:'Help me choose',es:'Ayúdame a elegir',fr:'Aidez-moi à choisir',tr:'Seçmeme yardım et'},
    'دفع آمن': {en:'Secure payment',es:'Pago seguro',fr:'Paiement sécurisé',tr:'Güvenli ödeme'},
    'مخزون حقيقي': {en:'Real inventory',es:'Inventario real',fr:'Stock réel',tr:'Gerçek stok'},
    'لا نعرض وهميًا': {en:'No fake listings',es:'Sin anuncios ficticios',fr:'Aucune fausse annonce',tr:'Sahte listeleme yok'},
    'متابعة الطلب': {en:'Order tracking',es:'Seguimiento del pedido',fr:'Suivi de commande',tr:'Sipariş takibi'},
    'من حسابك': {en:'From your account',es:'Desde tu cuenta',fr:'Depuis votre compte',tr:'Hesabınızdan'},
    'استكشف': {en:'Explore',es:'Explorar',fr:'Explorer',tr:'Keşfet'},
    'تسوّق حسب القسم': {en:'Shop by category',es:'Comprar por categoría',fr:'Acheter par catégorie',tr:'Kategoriye göre alışveriş'},
    'قسم': {en:'Category',es:'Categoría',fr:'Catégorie',tr:'Kategori'},
    'لا تبحث عن منتج.': {en:"Don't search for a product.",es:'No busques un producto.',fr:'Ne cherchez pas un produit.',tr:'Bir ürün aramayın.'},
    'قل لنا ماذا تحتاج.': {en:'Tell us what you need.',es:'Dinos qué necesitas.',fr:'Dites-nous ce dont vous avez besoin.',tr:'Bize neye ihtiyacınız olduğunu söyleyin.'},
    'مَخْرَج يبدأ من حاجتك ثم يوصلك إلى الأشياء التي تخدمها. يمكنك أيضًا التسوق بالطريقة المعتادة.': {en:'MAKHRAJ starts with your need, then connects you to what serves it. You can also shop normally.',es:'MAKHRAJ parte de tu necesidad y te conecta con lo que la resuelve. También puedes comprar de forma normal.',fr:'MAKHRAJ part de votre besoin puis vous relie à ce qui y répond. Vous pouvez aussi faire vos achats normalement.',tr:'MAKHRAJ ihtiyacınızdan başlar ve sizi ona hizmet eden ürünlere ulaştırır. Normal şekilde de alışveriş yapabilirsiniz.'},
    'أوجد لي مخرجًا': {en:'Find me a solution',es:'Encuentra una solución',fr:'Trouvez-moi une solution',tr:'Bana bir çözüm bul'},
    'اختيار ذكي': {en:'Smart choice',es:'Elección inteligente',fr:'Choix intelligent',tr:'Akıllı seçim'},
    'أو تسوّق بنفسك': {en:'Or shop yourself',es:'O compra por tu cuenta',fr:'Ou achetez vous-même',tr:'Ya da kendiniz alışveriş yapın'},
    'كل المنتجات': {en:'All products',es:'Todos los productos',fr:'Tous les produits',tr:'Tüm ürünler'},
    'المنتجات': {en:'Products',es:'Productos',fr:'Produits',tr:'Ürünler'},
    'عرض التفاصيل': {en:'View details',es:'Ver detalles',fr:'Voir les détails',tr:'Detayları gör'},
    'متوفر': {en:'In stock',es:'Disponible',fr:'En stock',tr:'Stokta'},
    'نفد المخزون': {en:'Out of stock',es:'Agotado',fr:'Rupture de stock',tr:'Stokta yok'},
    'كمية محدودة': {en:'Low stock',es:'Pocas unidades',fr:'Stock limité',tr:'Sınırlı stok'},
    'أضف إلى السلة': {en:'Add to cart',es:'Añadir al carrito',fr:'Ajouter au panier',tr:'Sepete ekle'},
    'سلة مَخْرَج': {en:'MAKHRAJ cart',es:'Carrito MAKHRAJ',fr:'Panier MAKHRAJ',tr:'MAKHRAJ sepeti'},
    'بيانات التوصيل': {en:'Delivery details',es:'Datos de entrega',fr:'Informations de livraison',tr:'Teslimat bilgileri'},
    'متابعة الدفع': {en:'Continue to payment',es:'Continuar al pago',fr:'Continuer vers le paiement',tr:'Ödemeye devam et'},
    'الدفع الآمن أونلاين عبر Stripe': {en:'Secure online payment via Stripe',es:'Pago seguro en línea con Stripe',fr:'Paiement en ligne sécurisé via Stripe',tr:'Stripe ile güvenli çevrimiçi ödeme'},
    'طلب تجريبي — بدون تحصيل أموال': {en:'Test order — no money charged',es:'Pedido de prueba — sin cobro',fr:'Commande test — aucun débit',tr:'Test siparişi — ücret alınmaz'},
    'تسجيل الدخول': {en:'Sign in',es:'Iniciar sesión',fr:'Se connecter',tr:'Giriş yap'},
    'إنشاء حساب': {en:'Create account',es:'Crear cuenta',fr:'Créer un compte',tr:'Hesap oluştur'},
    'تسجيل الخروج': {en:'Sign out',es:'Cerrar sesión',fr:'Se déconnecter',tr:'Çıkış yap'},
    'بياناتي': {en:'My profile',es:'Mis datos',fr:'Mon profil',tr:'Profilim'},
    'المفضلة': {en:'Favorites',es:'Favoritos',fr:'Favoris',tr:'Favoriler'},
    'عناويني': {en:'My addresses',es:'Mis direcciones',fr:'Mes adresses',tr:'Adreslerim'},
    'الإشعارات': {en:'Notifications',es:'Notificaciones',fr:'Notifications',tr:'Bildirimler'},
    'الدعم': {en:'Support',es:'Soporte',fr:'Assistance',tr:'Destek'},
    'لوحة البائع': {en:'Seller dashboard',es:'Panel del vendedor',fr:'Tableau vendeur',tr:'Satıcı paneli'},
    'تذكرة دعم جديدة': {en:'New support ticket',es:'Nuevo ticket de soporte',fr:'Nouveau ticket de support',tr:'Yeni destek talebi'},
    'إرسال': {en:'Send',es:'Enviar',fr:'Envoyer',tr:'Gönder'},
    'إرسال الرد': {en:'Send reply',es:'Enviar respuesta',fr:'Envoyer la réponse',tr:'Yanıt gönder'},
    'دعم مَخْرَج': {en:'MAKHRAJ Support',es:'Soporte MAKHRAJ',fr:'Support MAKHRAJ',tr:'MAKHRAJ Destek'},
    'أنت': {en:'You',es:'Tú',fr:'Vous',tr:'Siz'},
    'ترجمة تلقائية': {en:'Auto translation',es:'Traducción automática',fr:'Traduction automatique',tr:'Otomatik çeviri'},
    'النص الأصلي': {en:'Original',es:'Original',fr:'Original',tr:'Orijinal'},
    'الترجمة': {en:'Translation',es:'Traducción',fr:'Traduction',tr:'Çeviri'},
    'جارٍ الترجمة…': {en:'Translating…',es:'Traduciendo…',fr:'Traduction…',tr:'Çevriliyor…'},
    'تعذر الترجمة الآن': {en:'Translation is unavailable right now',es:'La traducción no está disponible ahora',fr:'La traduction est indisponible pour le moment',tr:'Çeviri şu anda kullanılamıyor'},
    'إدارة المتجر': {en:'Store admin',es:'Administración de tienda',fr:'Administration de la boutique',tr:'Mağaza yönetimi'},
    'منتجات، مخزون، طلبات، عملاء، خصومات وإعدادات — من الآيفون.': {en:'Products, inventory, orders, customers, discounts and settings — from your iPhone.',es:'Productos, inventario, pedidos, clientes, descuentos y ajustes — desde tu iPhone.',fr:'Produits, stock, commandes, clients, remises et paramètres — depuis votre iPhone.',tr:'Ürünler, stok, siparişler, müşteriler, indirimler ve ayarlar — iPhone’unuzdan.'},
    'فتح المتجر': {en:'Open store',es:'Abrir tienda',fr:'Ouvrir la boutique',tr:'Mağazayı aç'},
    'دخول محمي': {en:'Protected access',es:'Acceso protegido',fr:'Accès protégé',tr:'Korumalı erişim'},
    'حساب الإدارة': {en:'Admin account',es:'Cuenta de administración',fr:'Compte administrateur',tr:'Yönetici hesabı'},
    'نظرة عامة': {en:'Overview',es:'Resumen',fr:'Vue d’ensemble',tr:'Genel bakış'},
    'الطلبات': {en:'Orders',es:'Pedidos',fr:'Commandes',tr:'Siparişler'},
    'العملاء': {en:'Customers',es:'Clientes',fr:'Clients',tr:'Müşteriler'},
    'الخصومات': {en:'Discounts',es:'Descuentos',fr:'Remises',tr:'İndirimler'},
    'الإعدادات': {en:'Settings',es:'Ajustes',fr:'Paramètres',tr:'Ayarlar'},
    'الرسائل': {en:'Messages',es:'Mensajes',fr:'Messages',tr:'Mesajlar'},
    'المبيعات المدفوعة': {en:'Paid sales',es:'Ventas pagadas',fr:'Ventes payées',tr:'Ödenmiş satışlar'},
    'المنتجات المنشورة': {en:'Published products',es:'Productos publicados',fr:'Produits publiés',tr:'Yayındaki ürünler'},
    'مخزون منخفض': {en:'Low stock',es:'Stock bajo',fr:'Stock faible',tr:'Düşük stok'},
    'ملخص التشغيل': {en:'Operations summary',es:'Resumen operativo',fr:'Résumé des opérations',tr:'Operasyon özeti'},
    'تحديث': {en:'Refresh',es:'Actualizar',fr:'Actualiser',tr:'Yenile'},
    'إضافة منتج': {en:'Add product',es:'Añadir producto',fr:'Ajouter un produit',tr:'Ürün ekle'},
    'منتج جديد': {en:'New product',es:'Nuevo producto',fr:'Nouveau produit',tr:'Yeni ürün'},
    'اسم المنتج': {en:'Product name',es:'Nombre del producto',fr:'Nom du produit',tr:'Ürün adı'},
    'السعر': {en:'Price',es:'Precio',fr:'Prix',tr:'Fiyat'},
    'السعر قبل الخصم': {en:'Compare-at price',es:'Precio anterior',fr:'Prix avant remise',tr:'İndirim öncesi fiyat'},
    'الكمية': {en:'Quantity',es:'Cantidad',fr:'Quantité',tr:'Adet'},
    'القسم': {en:'Category',es:'Categoría',fr:'Catégorie',tr:'Kategori'},
    'العلامة التجارية': {en:'Brand',es:'Marca',fr:'Marque',tr:'Marka'},
    'الوزن بالجرام': {en:'Weight in grams',es:'Peso en gramos',fr:'Poids en grammes',tr:'Gram cinsinden ağırlık'},
    'تفاصيل إضافية للمنتج': {en:'Additional product details',es:'Detalles adicionales',fr:'Détails supplémentaires',tr:'Ek ürün detayları'},
    'الحالة': {en:'Condition',es:'Estado',fr:'État',tr:'Durum'},
    'الوصف': {en:'Description',es:'Descripción',fr:'Description',tr:'Açıklama'},
    'صور المنتج': {en:'Product photos',es:'Fotos del producto',fr:'Photos du produit',tr:'Ürün fotoğrafları'},
    'حفظ كمسودة': {en:'Save draft',es:'Guardar borrador',fr:'Enregistrer le brouillon',tr:'Taslak kaydet'},
    'حفظ ونشر': {en:'Save & publish',es:'Guardar y publicar',fr:'Enregistrer et publier',tr:'Kaydet ve yayınla'},
    'إدارة الأقسام': {en:'Manage categories',es:'Gestionar categorías',fr:'Gérer les catégories',tr:'Kategorileri yönet'},
    'قسم جديد': {en:'New category',es:'Nueva categoría',fr:'Nouvelle catégorie',tr:'Yeni kategori'},
    'إضافة': {en:'Add',es:'Añadir',fr:'Ajouter',tr:'Ekle'},
    'إدارة الطلب': {en:'Manage order',es:'Gestionar pedido',fr:'Gérer la commande',tr:'Siparişi yönet'},
    'أكواد الخصم': {en:'Discount codes',es:'Códigos de descuento',fr:'Codes promo',tr:'İndirim kodları'},
    'كود خصم جديد': {en:'New discount code',es:'Nuevo código de descuento',fr:'Nouveau code promo',tr:'Yeni indirim kodu'},
    'إنشاء الكود': {en:'Create code',es:'Crear código',fr:'Créer le code',tr:'Kod oluştur'},
    'إعدادات المتجر': {en:'Store settings',es:'Ajustes de tienda',fr:'Paramètres de la boutique',tr:'Mağaza ayarları'},
    'البيع والشحن': {en:'Sales & shipping',es:'Ventas y envíos',fr:'Vente et livraison',tr:'Satış ve kargo'},
    'اسم المتجر': {en:'Store name',es:'Nombre de la tienda',fr:'Nom de la boutique',tr:'Mağaza adı'},
    'رسوم الشحن القياسية': {en:'Standard shipping fee',es:'Tarifa de envío estándar',fr:'Frais de livraison standard',tr:'Standart kargo ücreti'},
    'شحن مجاني ابتداءً من': {en:'Free shipping from',es:'Envío gratis desde',fr:'Livraison gratuite à partir de',tr:'Ücretsiz kargo sınırı'},
    'بريد الدعم': {en:'Support email',es:'Correo de soporte',fr:'E-mail du support',tr:'Destek e-postası'},
    'حفظ الإعدادات': {en:'Save settings',es:'Guardar ajustes',fr:'Enregistrer les paramètres',tr:'Ayarları kaydet'},
    'محادثات الدعم': {en:'Support conversations',es:'Conversaciones de soporte',fr:'Conversations de support',tr:'Destek konuşmaları'},
    'رد على العميل': {en:'Reply to customer',es:'Responder al cliente',fr:'Répondre au client',tr:'Müşteriye yanıt ver'}
  };

  const placeholders = {
    'ابحث عن منتج…': {en:'Search products…',es:'Buscar productos…',fr:'Rechercher des produits…',tr:'Ürün ara…'},
    'مثال: أحتاج هدية عملية الليلة': {en:'Example: I need a practical gift tonight',es:'Ejemplo: necesito un regalo práctico esta noche',fr:'Exemple : j’ai besoin d’un cadeau pratique ce soir',tr:'Örnek: Bu gece pratik bir hediyeye ihtiyacım var'},
    'البريد الإلكتروني': {en:'Email',es:'Correo electrónico',fr:'E-mail',tr:'E-posta'},
    'كلمة المرور': {en:'Password',es:'Contraseña',fr:'Mot de passe',tr:'Şifre'},
    'اكتب ردك': {en:'Write your reply',es:'Escribe tu respuesta',fr:'Écrivez votre réponse',tr:'Yanıtınızı yazın'},
    'عنوان المشكلة': {en:'Issue subject',es:'Asunto del problema',fr:'Objet du problème',tr:'Sorun başlığı'},
    'اشرح ما الذي تحتاج مساعدتنا فيه': {en:'Tell us what you need help with',es:'Cuéntanos en qué necesitas ayuda',fr:'Expliquez-nous votre besoin',tr:'Neye yardım gerektiğini anlatın'},
    'بحث بالاسم أو SKU أو القسم...': {en:'Search by name, SKU or category…',es:'Buscar por nombre, SKU o categoría…',fr:'Rechercher par nom, SKU ou catégorie…',tr:'Ad, SKU veya kategori ile ara…'},
    'قسم جديد': {en:'New category',es:'Nueva categoría',fr:'Nouvelle catégorie',tr:'Yeni kategori'}
  };

  const textOriginal = new WeakMap();
  const attrOriginal = new WeakMap();

  function lang(){ return localStorage.getItem('makhraj-language') || 'ar'; }
  function tr(text, target=lang()){
    if(target==='ar') return text;
    return D[text]?.[target] || text;
  }
  function rememberText(node){
    if(!textOriginal.has(node)) textOriginal.set(node,node.nodeValue);
    return textOriginal.get(node);
  }
  function translateTextNode(node,target){
    const original=rememberText(node);
    const trimmed=original.trim();
    if(!trimmed) return;
    const translated=tr(trimmed,target);
    if(translated===trimmed){ node.nodeValue=original; return; }
    const lead=original.match(/^\s*/)?.[0]||'', tail=original.match(/\s*$/)?.[0]||'';
    node.nodeValue=lead+translated+tail;
  }
  function rememberAttrs(el){
    if(!attrOriginal.has(el)) attrOriginal.set(el,{
      placeholder:el.getAttribute?.('placeholder'),
      title:el.getAttribute?.('title'),
      aria:el.getAttribute?.('aria-label')
    });
    return attrOriginal.get(el);
  }
  function translateElement(el,target){
    if(!(el instanceof Element) || el.closest('[data-no-i18n]')) return;
    const a=rememberAttrs(el);
    if(a.placeholder!=null){
      const base=a.placeholder;
      const val=target==='ar'?base:(placeholders[base]?.[target]||D[base]?.[target]||base);
      el.setAttribute('placeholder',val);
    }
    if(a.title!=null) el.setAttribute('title',target==='ar'?a.title:tr(a.title,target));
    if(a.aria!=null) el.setAttribute('aria-label',target==='ar'?a.aria:tr(a.aria,target));
    [...el.childNodes].forEach(n=>{
      if(n.nodeType===Node.TEXT_NODE) translateTextNode(n,target);
      else if(n.nodeType===Node.ELEMENT_NODE) translateElement(n,target);
    });
  }
  function apply(root=document){
    const target=lang();
    document.documentElement.lang=target;
    document.documentElement.dir=LANGS[target]?.dir||'ltr';
    if(root===document) translateElement(document.body,target);
    else if(root instanceof Element) translateElement(root,target);
    const select=document.querySelector('#languageSwitcher');
    if(select) select.value=target;
  }
  function setLanguage(value){
    const target=LANGS[value]?value:'ar';
    localStorage.setItem('makhraj-language',target);
    apply(document);
    document.dispatchEvent(new CustomEvent('makhraj:languagechange',{detail:{language:target}}));
  }
  function mountSwitcher(){
    const select=document.querySelector('#languageSwitcher');
    if(!select)return;
    select.innerHTML=Object.entries(LANGS).map(([code,x])=>'<option value="'+code+'">'+x.label+'</option>').join('');
    select.value=lang();
    select.onchange=()=>setLanguage(select.value);
  }

  const observer=new MutationObserver(records=>{
    const target=lang();
    for(const r of records){
      for(const n of r.addedNodes){
        if(n.nodeType===Node.ELEMENT_NODE) translateElement(n,target);
        else if(n.nodeType===Node.TEXT_NODE) translateTextNode(n,target);
      }
    }
  });

  window.MakhrajI18n={
    languages:LANGS,
    t:tr,
    get language(){return lang()},
    setLanguage,
    apply
  };

  document.addEventListener('DOMContentLoaded',()=>{
    mountSwitcher();
    apply(document);
    observer.observe(document.body,{childList:true,subtree:true});
  });
})();