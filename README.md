# عيصر

محرر أكواد بالعربي: تكتب سطراً بلغتك فيحوّله الذكاء الاصطناعي إلى كود، مع مساعد للأسئلة وتسجيل دخول.

## الهيكل
```
backend/                      ← Node.js + Express + MongoDB
  server.js                   ← نقطة التشغيل (يتحقق من الإعدادات ويتصل بالقاعدة)
  seed.js                     ← إنشاء الحساب مرة واحدة
  src/
    app.js                    ← يجمع الـ middleware والراوترات
    config/                   ← env.js (الإعدادات) و db.js
    models/                   ← User.js
    controllers/              ← auth / ai / page
    routes/                   ← auth / ai / bridge / page / index
    middlewares/              ← auth, rateLimit, security (helmet + CORS), error
    services/                 ← gemini.service.js, token.service.js, prompts.js
    validators/               ← التحقق من مدخلات مسارات الذكاء
    bridge/                   ← الجسر المحلي (يعمل على جهازك فقط)
frontend/
  index.html                  ← المحرر
  login.html                  ← صفحة الدخول
  config.js                   ← عنوان الـ API (فارغ = نفس عنوان الصفحة)
package.json                  ← في الجذر: يحيل إلى backend (لتبقى أوامر Render كما هي)
```

## مسارات الـ API
| المسار | الوظيفة |
|---|---|
| `POST /api/auth/login` | دخول (كوكي httpOnly، أو توكن في الرد عند `issueToken: true` للتطبيقات) |
| `POST /api/auth/logout` | خروج من هذا الجهاز |
| `POST /api/auth/logout-all` | إنهاء كل الجلسات على كل الأجهزة |
| `GET /api/auth/me` | اسم المستخدم الحالي |
| `POST /api/ai/convert` | تحويل سطر إلى كود |
| `POST /api/ai/chat` | محادثة حول أسطر محددة |
| `POST /api/ai/project` | محادثة حول هيكل المشروع |
| `GET /healthz` | فحص الصحة (لـ UptimeRobot) |

المصادقة: كوكي `aysar_token`، أو ترويسة `Authorization: Bearer <token>`.

## التشغيل محلياً
```
npm install                       (من الجذر: يثبّت حزم backend أيضاً)
copy backend\.env.example backend\.env      ثم املأ القيم
npm run seed                      (مرة واحدة لإنشاء الحساب)
npm start                         (http://localhost:3000)
```
ملف `.env` مكانه **داخل مجلد backend**. لتفعيل الجسر المحلي (المجلدات وتشغيل الكود وVS Code) ضع فيه `ENABLE_BRIDGE=true`.

## النشر على Render
الأوامر كما هي: Build `npm install` و Start `npm start`، و Root Directory فارغ.

| المتغير | القيمة |
|---|---|
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| MONGODB_URI | رابط Atlas |
| JWT_SECRET | نص عشوائي 32+ حرفاً |
| GEMINI_API_KEY | مفتاحك |

اختيارية: `GEMINI_CHAT_MODEL` (نموذج أقوى للمحادثة)، `CSP_ENFORCE`، `CORS_ORIGINS`. **لا تضع** `ENABLE_BRIDGE` على Render.

## الأمان
- **الجسر المحلي** لا يعمل إلا بـ `ENABLE_BRIDGE=true` وعلى عنوان محلي. على Render يبقى مقفلاً دائماً.
- **قفل الحساب:** بعد 5 محاولات خاطئة يُقفل 15 دقيقة. وعلى الدخول حدّ آخر بحسب العنوان.
- **إبطال الجلسات:** زر "إنهاء كل الجلسات" يبطل كل التوكنات القديمة. وتغيير كلمة المرور بـ `npm run seed` يفعل ذلك أيضاً ويفك القفل.
- **سياسة CSP تبدأ بوضع المراقبة فقط:** لا تحجب شيئاً، وتكتب المخالفات في Console المتصفح (F12). افتح المحرر وجرّب الميزات، فإن لم تظهر مخالفات فاجعل `CSP_ENFORCE=true`.
- **CORS مغلق** حتى تضع عناوين في `CORS_ORIGINS` (مثل تطبيق سطح المكتب).
- مفاتيحك في متغيرات البيئة فقط، ولا يُرفع `.env` أبداً.
