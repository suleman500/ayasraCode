const express = require("express");
const ctrl = require("../controllers/auth.controller");
const { authRequired } = require("../middlewares/auth");
const { loginLimiter } = require("../middlewares/rateLimit");

const router = express.Router();
router.post("/login", loginLimiter, express.json({ limit: "5kb" }), ctrl.login);
router.post("/logout", ctrl.logout);
router.post("/logout-all", authRequired, ctrl.logoutAll);
router.get("/me", authRequired, ctrl.me);

module.exports = router;
