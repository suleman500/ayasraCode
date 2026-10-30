const express = require("express");
const { authRequired } = require("../middlewares/auth");

// الجسر المحلي: يعمل فقط عند التشغيل على جهازك (ENABLE_BRIDGE=true وعنوان محلي)، ويُقفل في الاستضافة.
// لا نستخدم express.json هنا لأن الجسر يقرأ الجسم بنفسه.
module.exports = (bridge) => {
  const router = express.Router();
  router.use(authRequired, (req, res) => {
    if (!bridge.enabled) return res.status(404).json({ error: "الجسر مقفل لأنه غير مفعّل أو لأن السيرفر مفتوح لغير جهازك" });
    bridge.handle(req, res, new URL(req.originalUrl, "http://localhost"));
  });
  return router;
};
