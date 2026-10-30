// نقطة التشغيل: تتحقق من الإعدادات، تتصل بقاعدة البيانات، ثم تشغّل التطبيق.
const config = require("./src/config/env");
const { connectDB } = require("./src/config/db");

function fail(msg) { console.error("خطأ في الإعدادات: " + msg); process.exit(1); }

const errors = config.validate();
if (errors.length) fail(errors.join(" | "));
if (!config.gemini.key) console.warn("تنبيه: GEMINI_API_KEY غير موجود، فالذكاء الاصطناعي لن يعمل.");
if (config.enableBridge && config.host !== "127.0.0.1" && config.host !== "localhost") {
  console.warn("تنبيه: ENABLE_BRIDGE=true لكن HOST ليس محلياً، فالجسر سيبقى مقفلاً.");
}

(async () => {
  try {
    await connectDB(config.mongoUri);
    console.log("تم الاتصال بقاعدة البيانات");
  } catch (err) {
    fail("تعذّر الاتصال بـ MongoDB: " + err.message);
  }

  const bridge = require("./src/bridge/bridge").create({ host: config.host, port: config.port, allow: config.enableBridge });
  const { createApp } = require("./src/app");
  const server = createApp({ bridge }).listen(config.port, config.host, () => {
    console.log(`عيصر شغّال على المنفذ ${config.port} (${config.host}) - النموذج: ${config.gemini.model}`);
    console.log(bridge.enabled ? "الجسر المحلي: مفعّل (تشغيل محلي)" : "الجسر المحلي: مقفل");
    console.log(config.cspEnforce ? "CSP: مفروضة" : "CSP: وضع المراقبة فقط (لا تحجب)");
  });

  // إيقاف مرتب عند إعادة تشغيل Render
  const stop = () => { bridge.stop && bridge.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
})();
