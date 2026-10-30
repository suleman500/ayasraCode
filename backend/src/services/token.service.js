const jwt = require("jsonwebtoken");
const config = require("../config/env");
const User = require("../models/User");

const tv = (d) => Number(d && d.tokenVersion) || 0;   // الحقل قد يكون غائباً في حسابات قديمة
const CACHE_MS = 15000;
const cache = new Map();                              // id -> { v, until }

function sign(user) {
  return jwt.sign({ id: String(user._id), username: user.username, tv: tv(user) }, config.jwtSecret, { expiresIn: `${config.tokenDays}d` });
}

function verify(token) {
  try { return jwt.verify(token, config.jwtSecret); } catch { return null; }
}

// هل ما زال التوكن صالحاً؟ (الحساب موجود ورقم النسخة مطابق). نخزّن النتيجة 15 ثانية لتخفيف ضغط القاعدة.
async function isCurrent(payload) {
  if (!payload || !payload.id) return false;
  const hit = cache.get(payload.id);
  let v;
  if (hit && hit.until > Date.now()) v = hit.v;
  else {
    const doc = await User.findById(payload.id).select("tokenVersion").lean();
    v = doc ? tv(doc) : null;
    cache.set(payload.id, { v, until: Date.now() + CACHE_MS });
  }
  return v !== null && v === (Number(payload.tv) || 0);
}

function invalidate(id) { cache.delete(String(id)); }
function clearCache() { cache.clear(); }

module.exports = { sign, verify, isCurrent, invalidate, clearCache };
