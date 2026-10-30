const isApi = (req) => req.path.startsWith("/api/") || req.path === "/convert";

function notFound(req, res) {
  if (isApi(req)) return res.status(404).json({ error: "غير موجود" });
  res.status(404).type("text").send("Not found");
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = 500, message = "خطأ في السيرفر، حاول مرة ثانية";
  if (err.type === "entity.parse.failed") { status = 400; message = "طلب غير صالح"; }
  else if (err.type === "entity.too.large") { status = 413; message = "الطلب كبير جداً"; }
  else console.error("server error:", err && err.message);
  if (isApi(req)) return res.status(status).json({ error: message });
  res.status(status).type("text").send(message);
}

module.exports = { notFound, errorHandler };
