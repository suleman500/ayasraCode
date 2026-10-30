const express = require("express");
const ctrl = require("../controllers/ai.controller");
const { authRequired } = require("../middlewares/auth");
const { convertLimiter, chatLimiter } = require("../middlewares/rateLimit");

const router = express.Router();
router.use(authRequired);
router.post("/convert", convertLimiter, express.json({ limit: "60kb" }), ctrl.convert);
router.post("/chat", chatLimiter, express.json({ limit: "120kb" }), ctrl.chat);
router.post("/project", chatLimiter, express.json({ limit: "120kb" }), ctrl.project);

module.exports = router;
