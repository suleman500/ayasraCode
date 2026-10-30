// كل الإعدادات من متغيرات البيئة. الخصائص (getters) تقرأ القيمة وقت الطلب، فيسهل اختبارها.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const env = process.env;

const config = {
  get env() { return env.NODE_ENV || "development"; },
  get isProd() { return env.NODE_ENV === "production"; },
  get port() { return Number(env.PORT) || 3000; },
  get host() { return env.HOST || "127.0.0.1"; },
  get mongoUri() { return env.MONGODB_URI; },
  get jwtSecret() { return env.JWT_SECRET; },
  tokenDays: 7,
  // الجسر المحلي (تشغيل كود وقراءة ملفات): لا يعمل إلا بتفعيل صريح وعلى عنوان محلي
  get enableBridge() { return env.ENABLE_BRIDGE === "true"; },
  // عناوين مسموح لها بالاتصال من موقع/تطبيق آخر (مثل تطبيق سطح المكتب). فارغة = لا أحد.
  get corsOrigins() { return list(env.CORS_ORIGINS); },
  // سياسة CSP تبدأ بوضع المراقبة فقط (لا تحجب). اجعلها true بعد التأكد أن المحرر يعمل بلا مخالفات.
  get cspEnforce() { return env.CSP_ENFORCE === "true"; },
  gemini: {
    get key() { return env.GEMINI_API_KEY; },
    get model() { return env.GEMINI_MODEL || "gemini-flash-lite-latest"; },
    get chatModel() { return env.GEMINI_CHAT_MODEL || this.model; },
  },
  lock: { maxFailures: 5, minutes: 15 },   // قفل الحساب مؤقتاً بعد 5 محاولات خاطئة
  frontendDir: path.join(__dirname, "..", "..", "..", "frontend"),
};

// يرجع قائمة أخطاء الإعداد (فارغة = سليم)
config.validate = function validate() {
  const errors = [];
  if (!config.mongoUri) errors.push("MONGODB_URI غير موجود");
  if (!config.jwtSecret || config.jwtSecret.length < 32) errors.push("JWT_SECRET لازم يكون نصاً عشوائياً طوله 32 حرفاً على الأقل");
  return errors;
};

module.exports = config;
