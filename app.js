// app.js — تطبيق Express (بدون تشغيل). التشغيل والاتصال بقاعدة البيانات في server.js
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const User = require("./models/User");

const COOKIE = "aysar_token";
const TOKEN_DAYS = 7;
const isProd = process.env.NODE_ENV === "production";

function createApp({ bridge, convert, hasGeminiKey }) {
  const JWT_SECRET = process.env.JWT_SECRET;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render يعمل خلف بروكسي HTTPS

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use(cookieParser());

  // ---------- أدوات الدخول ----------
  const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

  function readUser(req) {
    const t = req.cookies && req.cookies[COOKIE];
    if (!t) return null;
    try { return jwt.verify(t, JWT_SECRET); } catch { return null; }
  }

  function authRequired(req, res, next) {
    const user = readUser(req);
    if (user) { req.user = user; return next(); }
    const wantsHtml = req.method === "GET" && (req.headers.accept || "").includes("text/html");
    if (wantsHtml) return res.redirect("/login");
    res.status(401).json({ error: "سجّل الدخول أولاً" });
  }

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: "محاولات كثيرة. انتظر بضع دقائق ثم أعد المحاولة." },
  });
  const convertLimiter = rateLimit({
    windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
    message: { error: "طلبات كثيرة، جرّب بعد دقيقة" },
  });

  // ---------- مسارات عامة ----------
  app.get("/healthz", (req, res) => res.type("text").send("ok"));

  app.get("/login", (req, res) => {
    if (readUser(req)) return res.redirect("/");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "public", "login.html"));
  });

  app.post("/api/login", loginLimiter, express.json({ limit: "5kb" }), async (req, res) => {
    try {
      const username = String((req.body && req.body.username) || "").trim().toLowerCase();
      const password = String((req.body && req.body.password) || "");
      if (!username || !password || username.length > 40 || password.length > 200) {
        return res.status(400).json({ error: "أدخل اسم المستخدم وكلمة المرور" });
      }
      const user = await User.findOne({ username });
      // نقارن دائماً حتى لو المستخدم غير موجود، كي لا يظهر فرق بالزمن
      const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
      if (!user || !ok) return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });

      const token = jwt.sign({ id: String(user._id), username: user.username }, JWT_SECRET, { expiresIn: `${TOKEN_DAYS}d` });
      res.cookie(COOKIE, token, {
        httpOnly: true, sameSite: "lax", secure: isProd, maxAge: TOKEN_DAYS * 24 * 3600 * 1000, path: "/",
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("login error:", err.message);
      res.status(500).json({ error: "خطأ في السيرفر، حاول مرة ثانية" });
    }
  });

  app.post("/api/logout", (req, res) => {
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: isProd, path: "/" });
    res.json({ ok: true });
  });

  // ---------- كل ما بعد هذا السطر يحتاج تسجيل دخول ----------
  app.get("/api/me", authRequired, (req, res) => res.json({ username: req.user.username }));

  // الجسر المحلي (يعمل فقط عند التشغيل على جهازك، ويُقفل تلقائياً على Render)
  app.use("/api/bridge", authRequired, (req, res) => {
    if (!bridge.enabled) return res.status(404).json({ error: "الجسر مقفل لأن السيرفر مفتوح لغير جهازك" });
    bridge.handle(req, res, new URL(req.originalUrl, "http://localhost"));
  });

  app.get(["/", "/aysar.html"], authRequired, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, "aysar.html"));
    if (bridge.enabled) html = bridge.injectToken(html);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  });

  app.post("/convert", authRequired, convertLimiter, express.json({ limit: "60kb" }), async (req, res) => {
    if (!hasGeminiKey) return res.status(500).json({ error: "GEMINI_API_KEY غير مضبوط على السيرفر" });
    const { text, language, before = "", after = "" } = req.body || {};
    if (typeof text !== "string" || !text.trim() || text.length > 1000 || !["python", "javascript", "dart"].includes(language)) {
      return res.status(400).json({ error: "طلب غير صالح" });
    }
    try {
      const code = await convert({ text, language, before: String(before), after: String(after) });
      res.json({ code });
    } catch (err) {
      res.status(500).json({ error: err.message || "خطأ غير متوقع" });
    }
  });

  // ملفات الأصوات (اختيارية): ضع الملفات في مجلد sounds
  app.get("/sounds/:name", authRequired, (req, res) => {
    const dir = path.join(__dirname, "sounds");
    const name = req.params.name;
    const types = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg" };
    const roles = ["click", "key", "enter", "backspace", "space", "start", "thinking", "success", "error", "deny"];
    if (name === "index.json") {
      const map = {};
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          const ext = path.extname(f).toLowerCase();
          const base = path.basename(f, path.extname(f)).toLowerCase();
          if (types[ext] && roles.includes(base)) map[base] = f;
        }
      }
      res.setHeader("Cache-Control", "no-cache");
      return res.json(map);
    }
    const ext = path.extname(name).toLowerCase();
    if (/^[A-Za-z0-9_.-]+$/.test(name) && types[ext] && fs.existsSync(path.join(dir, name))) {
      res.setHeader("Content-Type", types[ext]);
      res.setHeader("Cache-Control", "no-cache");
      return res.send(fs.readFileSync(path.join(dir, name)));
    }
    res.status(404).send("Not found");
  });

  app.use((req, res) => res.status(404).send("Not found"));
  return app;
}

module.exports = { createApp };
