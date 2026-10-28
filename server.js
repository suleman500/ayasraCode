// تشغيل محلي: npm install ثم npm start   |   على Render: نفس الأمر تلقائياً
require("dotenv").config();
const mongoose = require("mongoose");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";   // على Render اضبط HOST=0.0.0.0
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

function fail(msg) { console.error("خطأ في الإعدادات: " + msg); process.exit(1); }
if (!process.env.MONGODB_URI) fail("MONGODB_URI غير موجود");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) fail("JWT_SECRET لازم يكون نصاً عشوائياً طوله 32 حرفاً على الأقل");
if (!KEY) console.warn("تنبيه: GEMINI_API_KEY غير موجود، فالتحويل بالذكاء الاصطناعي لن يعمل.");

const INSTRUCTIONS = `You are the conversion engine inside a beginner-friendly code editor.
The student writes ONE line in plain human language (any language, often Arabic) describing what they want, or sometimes already-valid code.
Convert it into simple, idiomatic code in the target programming language.
Rules:
- Output ONLY code. No explanations, no markdown fences.
- Use the surrounding code for context (existing variable names, whether we are inside a function, etc.).
- Write the code with zero indentation on its first line; the editor adds the indentation.
- If the line is already valid code, return it unchanged.
- Keep identifiers in English.
- Be minimal: do only what the line asks. Do not add imports, main functions, or extra features unless the line requires them.`;

function cleanCode(t) {
  t = t.trim();
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  return (m ? m[1] : t).replace(/\s+$/, "");
}

async function convert({ text, language, before, after }) {
  const prompt =
    `Target language: ${language}\n\n` +
    `Code before the line:\n${before || "(none)"}\n\n` +
    `Code after the line:\n${after || "(none)"}\n\n` +
    `Line to convert:\n${text}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const started = Date.now();
  let thinkingOff = true;
  let r;

  for (let attempt = 1; attempt <= 3; attempt++) {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: thinkingOff
          ? { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } }
          : { temperature: 0.2 },
      }),
    });
    if (r.status === 400 && thinkingOff) { thinkingOff = false; attempt--; continue; }
    if ([500, 502, 503, 504].includes(r.status) && attempt < 3) {
      console.log(`Gemini ${r.status}، إعادة المحاولة ${attempt}...`);
      await sleep(attempt * 800);
      continue;
    }
    break;
  }
  console.log(`زمن التحويل: ${Date.now() - started}ms (الحالة ${r.status})`);

  if (r.status === 429) throw new Error("وصلت للحد المجاني، جرّب بعد دقيقة");
  if (r.status === 503) throw new Error("خدمة Google مشغولة الآن، جرّب بعد قليل");
  if (!r.ok) {
    console.error("Gemini error:", r.status, await r.text());
    throw new Error(`خطأ من الذكاء الاصطناعي (${r.status})`);
  }
  const data = await r.json();
  const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!out.trim()) throw new Error("ما رجع كود، جرّب صياغة ثانية");
  return cleanCode(out);
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("تم الاتصال بقاعدة البيانات");
  } catch (err) {
    fail("تعذّر الاتصال بـ MongoDB: " + err.message);
  }

  const bridge = require("./bridge").create({ host: HOST, port: PORT });
  const { createApp } = require("./app");
  const app = createApp({ bridge, convert, hasGeminiKey: !!KEY });

  app.listen(PORT, HOST, () => {
    console.log(`عيصر شغّال على المنفذ ${PORT} (${HOST}) - النموذج: ${MODEL}`);
    console.log(bridge.enabled ? "الجسر المحلي: مفعّل (تشغيل محلي)" : "الجسر المحلي: مقفل (وضع الاستضافة)");
  });
})();
