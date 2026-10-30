const tokenService = require("../services/token.service");

const COOKIE = "aysar_token";

// التوكن من الكوكي (المتصفح) أو من ترويسة Authorization: Bearer (تطبيق سطح المكتب لاحقاً)
function extractToken(req) {
  const c = req.cookies && req.cookies[COOKIE];
  if (c) return c;
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// يرجع { id, username } أو null
async function authenticate(req) {
  const token = extractToken(req);
  if (!token) return null;
  const payload = tokenService.verify(token);
  if (!payload) return null;
  if (!(await tokenService.isCurrent(payload))) return null;
  return { id: payload.id, username: payload.username };
}

async function authRequired(req, res, next) {
  try {
    const user = await authenticate(req);
    if (user) { req.user = user; return next(); }
    const wantsHtml = req.method === "GET" && (req.headers.accept || "").includes("text/html");
    if (wantsHtml) return res.redirect("/login");
    res.status(401).json({ error: "سجّل الدخول أولاً" });
  } catch (err) {
    next(err);
  }
}

module.exports = { COOKIE, authenticate, authRequired };
