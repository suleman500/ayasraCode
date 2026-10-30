const express = require("express");
const authRoutes = require("./auth.routes");
const aiRoutes = require("./ai.routes");
const bridgeRoutes = require("./bridge.routes");
const pageRoutes = require("./page.routes");
const aiCtrl = require("../controllers/ai.controller");
const { authRequired } = require("../middlewares/auth");
const { convertLimiter } = require("../middlewares/rateLimit");

module.exports = function buildRouter({ bridge }) {
  const router = express.Router();
  router.use("/api/auth", authRoutes);
  router.use("/api/ai", aiRoutes);
  router.use("/api/bridge", bridgeRoutes(bridge));
  // اسم قديم للتحويل: يبقى مؤقتاً كي لا تنكسر صفحة مفتوحة أثناء التحديث (احذفه لاحقاً)
  router.post("/convert", authRequired, convertLimiter, express.json({ limit: "60kb" }), aiCtrl.convert);
  router.use(pageRoutes(bridge));
  return router;
};
