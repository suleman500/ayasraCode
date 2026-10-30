const helmet = require("helmet");
const config = require("../config/env");

// الموارد الخارجية التي تحملها الصفحة: Monaco من jsdelivr، وخطوط Google.
// السكربتات داخل الصفحة نفسها، لذلك نحتاج 'unsafe-inline' للسكربت (الحماية منه محدودة)،
// لكن بقية القيود (التضمين في إطار، object، base، form) مفيدة.
const directives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
  fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "data:"],
  imgSrc: ["'self'", "data:", "blob:"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'", "blob:"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
};

const make = (reportOnly) =>
  helmet({
    contentSecurityPolicy: { useDefaults: false, reportOnly, directives },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "same-origin" },
  });

const enforcing = make(false);
const reporting = make(true);

// وضع المراقبة هو الافتراضي: يسجّل المخالفات في Console المتصفح ولا يحجب شيئاً
function securityHeaders(req, res, next) {
  return (config.cspEnforce ? enforcing : reporting)(req, res, next);
}

// CORS مغلق افتراضياً. يُفتح فقط للعناوين المكتوبة في CORS_ORIGINS (مثلاً تطبيق سطح المكتب).
// لا نرسل Allow-Credentials: الاتصال من الخارج يكون بتوكن في الترويسة لا بالكوكي.
function cors(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  if (config.corsOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  }
  if (req.method === "OPTIONS") return res.sendStatus(403);
  next();
}

module.exports = { securityHeaders, cors };
