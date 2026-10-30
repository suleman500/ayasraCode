// التحقق من مدخلات مسارات الذكاء. كل دالة ترجع { ok: true, value } أو { ok: false, error }.
const LANGS = ["python", "javascript", "dart", "html", "css"];

function cleanMessages(raw) {
  const msgs = (Array.isArray(raw) ? raw.slice(-12) : [])
    .filter((m) => m && (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role, text: m.text.slice(0, 6000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();   // Gemini يطلب أن تبدأ المحادثة برسالة مستخدم
  return msgs;
}
const endsWithUser = (msgs) => msgs.length > 0 && msgs[msgs.length - 1].role === "user";

function validateConvert(body) {
  const { text, language, before = "", after = "" } = body || {};
  if (typeof text !== "string" || !text.trim() || text.length > 1000 || !LANGS.includes(language)) {
    return { ok: false, error: "طلب غير صالح" };
  }
  return { ok: true, value: { text, language, before: String(before), after: String(after) } };
}

function validateChat(body) {
  const b = body || {};
  const file = typeof b.file === "string" ? b.file.slice(0, 200) : "";
  const language = typeof b.language === "string" && /^[a-z0-9+#.-]{1,30}$/i.test(b.language) ? b.language : "plaintext";
  const code = typeof b.code === "string" ? b.code : "";
  const startLine = Number.isInteger(b.startLine) && b.startLine > 0 ? b.startLine : 1;
  const endLine = Number.isInteger(b.endLine) && b.endLine >= startLine ? b.endLine : startLine;
  if (!code.trim() || code.length > 20000) return { ok: false, error: "الكود المحدد فارغ أو كبير جداً" };
  const messages = cleanMessages(b.messages);
  if (!endsWithUser(messages)) return { ok: false, error: "طلب غير صالح" };
  return { ok: true, value: { file, language, startLine, endLine, code, messages } };
}

function validateProject(body) {
  const b = body || {};
  const paths = (Array.isArray(b.paths) ? b.paths : [])
    .filter((p) => typeof p === "string" && p.trim() && p.length <= 300)
    .slice(0, 400);
  const currentFolder = typeof b.currentFolder === "string" ? b.currentFolder.slice(0, 300) : "";
  const messages = cleanMessages(b.messages);
  if (!endsWithUser(messages)) return { ok: false, error: "طلب غير صالح" };
  return { ok: true, value: { paths, currentFolder, messages } };
}

module.exports = { validateConvert, validateChat, validateProject, LANGS };
