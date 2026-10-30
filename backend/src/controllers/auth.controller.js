const bcrypt = require("bcryptjs");
const config = require("../config/env");
const User = require("../models/User");
const tokenService = require("../services/token.service");
const { COOKIE } = require("../middlewares/auth");

const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);
const cookieOpts = () => ({ httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/" });
const GENERIC = "اسم المستخدم أو كلمة المرور غير صحيحة، أو أن الحساب مقفل مؤقتاً بعد محاولات كثيرة.";

async function login(req, res, next) {
  try {
    const body = req.body || {};
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || !password || username.length > 40 || password.length > 200) {
      return res.status(400).json({ error: "أدخل اسم المستخدم وكلمة المرور" });
    }
    const user = await User.findOne({ username });
    const locked = !!user && user.isLocked();
    // نقارن دائماً (حتى لو المستخدم غير موجود أو مقفل) كي لا يظهر فرق بالزمن
    const ok = await bcrypt.compare(password, user && !locked ? user.passwordHash : DUMMY_HASH);
    if (!user || locked || !ok) {
      if (user && !locked && !ok) await User.recordFailure(user, config.lock.maxFailures, config.lock.minutes);
      return res.status(401).json({ error: GENERIC });   // نفس الرسالة في كل الحالات
    }
    if (user.failedLogins > 0 || user.lockUntil) await User.recordSuccess(user);

    const token = tokenService.sign(user);
    // تطبيق سطح المكتب يطلب التوكن في الرد (issueToken)، والمتصفح يأخذه في كوكي httpOnly لا تقرؤه الصفحة
    if (body.issueToken === true) return res.json({ ok: true, token });
    res.cookie(COOKIE, token, { ...cookieOpts(), maxAge: config.tokenDays * 24 * 3600 * 1000 });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie(COOKIE, cookieOpts());
  res.json({ ok: true });
}

// خروج من كل الأجهزة: يبطل كل التوكنات الصادرة قبل الآن
async function logoutAll(req, res, next) {
  try {
    await User.revokeSessions(req.user.id);
    tokenService.invalidate(req.user.id);
    res.clearCookie(COOKIE, cookieOpts());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

function me(req, res) {
  res.json({ username: req.user.username });
}

module.exports = { login, logout, logoutAll, me };
