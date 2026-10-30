const rateLimit = require("express-rate-limit");

const make = (windowMs, max, error) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error } });

module.exports = {
  loginLimiter: make(15 * 60 * 1000, 10, "محاولات كثيرة. انتظر بضع دقائق ثم أعد المحاولة."),
  convertLimiter: make(60 * 1000, 30, "طلبات كثيرة، جرّب بعد دقيقة"),
  chatLimiter: make(60 * 1000, 20, "طلبات كثيرة، جرّب بعد دقيقة"),
};
