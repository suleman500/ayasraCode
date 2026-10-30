const config = require("../config/env");
const gemini = require("../services/gemini.service");   // نستدعي عبر الكائن ليسهل استبداله في الاختبار
const v = require("../validators/ai.validator");

// ينفّذ الدالة بعد التحقق، ويحوّل أي خطأ إلى رسالة عربية للمحرر
const handler = (validate, run) => async (req, res) => {
  if (!config.gemini.key) return res.status(500).json({ error: "GEMINI_API_KEY غير مضبوط على السيرفر" });
  const check = validate(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    res.json(await run(check.value));
  } catch (err) {
    res.status(500).json({ error: err.message || "خطأ غير متوقع" });
  }
};

module.exports = {
  convert: handler(v.validateConvert, async (val) => ({ code: await gemini.convert(val) })),
  chat: handler(v.validateChat, (val) => gemini.chat(val)),
  project: handler(v.validateProject, (val) => gemini.projectChat(val)),
};
