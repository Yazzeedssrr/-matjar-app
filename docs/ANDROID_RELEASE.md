# خطة إصدار Android — مَخْرَج

## الهدف
إنتاج تطبيق Android رسمي قابل للتوقيع والنشر بصيغة AAB مع إبقاء متجر الويب مصدرًا مشتركًا للوظائف خلال مرحلة الانتقال.

## مراحل التنفيذ
- تثبيت الهوية وتجربة الهاتف أولًا.
- مراجعة Supabase والصلاحيات قبل اعتبار النسخة Production.
- فصل صلاحيات الزبون عن الإدارة.
- تجهيز Android package id نهائي.
- إنشاء أيقونات adaptive وsplash screen.
- بناء نسخة Android واختبار navigation/back/deep links/offline states.
- إنشاء signed AAB عبر مفتاح نشر يملكه صاحب الحساب.
- تجهيز Privacy Policy وData safety وStore listing.
- Internal testing ثم Closed/Open testing عند الحاجة ثم Production.

## شروط الأمان قبل الإنتاج
لا يوضع service-role key أو كلمة مرور إدارية أو أي سر داخل HTML/JavaScript أو تطبيق Android. مفاتيح العميل العامة تستخدم فقط مع RLS وسياسات قاعدة بيانات صحيحة.
