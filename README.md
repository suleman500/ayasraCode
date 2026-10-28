# عيصر: التشغيل والنشر

## 1) MongoDB Atlas (مرة واحدة)
1. أنشئ حساباً وكلاستر مجانياً (M0) على mongodb.com/atlas.
2. Database Access: أنشئ مستخدماً بكلمة مرور (تجنّب الرموز الخاصة في كلمة المرور).
3. Network Access: أضف `0.0.0.0/0` (لأن عنوان Render يتغير).
4. Connect ثم Drivers: انسخ الرابط، وضع اسم قاعدة البيانات قبل `?` مثل `/aysar?`.

## 2) تجربة محلية (اختياري)
```
npm install
copy .env.example .env      (ثم املأ القيم)
npm run seed                (ينشئ حسابك)
npm start                   (http://localhost:3000)
```
محلياً يعمل الجسر (المجلدات وتشغيل الكود وVS Code) لأن HOST=127.0.0.1.

## 3) GitHub
ارفع محتوى هذا المجلد كما هو. ملف `.gitignore` يمنع رفع `.env` والنسخ الاحتياطية.
تأكد أن `.env` غير موجود في المستودع قبل أول `git push`.

## 4) Render
New ثم Web Service ثم اختر المستودع:
- Build Command: `npm install`
- Start Command: `npm start`
- Environment (كلها مطلوبة):

| المتغير | القيمة |
|---|---|
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| MONGODB_URI | رابط Atlas |
| JWT_SECRET | نص عشوائي 32+ حرفاً |
| GEMINI_API_KEY | مفتاحك |

توليد JWT_SECRET:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 5) إنشاء الحساب (مرة واحدة)
من تبويب Shell في Render (أو محلياً بعد ضبط MONGODB_URI):
```
ADMIN_USER=اسمك ADMIN_PASS=كلمة_مرور_قوية npm run seed
```
لتغيير كلمة المرور لاحقاً أعد تشغيل الأمر بكلمة جديدة.
بعدها احذف ADMIN_PASS من أي مكان كتبته فيه.

## ملاحظات
- النسخة المجانية تنام بعد 15 دقيقة، وأول زيارة تتأخر نحو دقيقة. للتخفيف: UptimeRobot على `/healthz` كل 5 دقائق.
- على Render لا يعمل الجسر المحلي (قفل تلقائي). المشاريع تُحفظ في متصفحك وتنزَّل كملف ZIP.
- لا يوجد تسجيل عام. الحساب الوحيد هو الذي أنشأه seed.
