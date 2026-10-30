// كل الاتصال بـ Gemini هنا. لاحقاً يمكن إضافة deepseek.service.js بنفس الدوال.
const config = require("../config/env");
const prompts = require("./prompts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const endpoint = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const headers = () => ({ "Content-Type": "application/json", "x-goog-api-key": config.gemini.key });

function cleanCode(t) {
  t = t.trim();
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  return (m ? m[1] : t).replace(/\s+$/, "");
}

// للاقتراحات: نُبقي مسافات بداية السطر الأول
function cleanSuggestion(t) {
  t = String(t).replace(/\r\n/g, "\n");
  const m = t.match(/^\s*```[\w+#.-]*\n([\s\S]*?)\n?```\s*$/);
  if (m) t = m[1];
  return t.replace(/^\n+/, "").replace(/\s+$/, "");
}

function failFor(status) {
  if (status === 429) return new Error("وصلت للحد المجاني، جرّب بعد دقيقة");
  if (status === 503) return new Error("خدمة Google مشغولة الآن، جرّب بعد قليل");
  return new Error(`خطأ من الذكاء الاصطناعي (${status})`);
}

// ---------- تحويل سطر بلغة بشرية إلى كود ----------
async function convert({ text, language, before, after }) {
  const prompt =
    `Target language: ${language}\n\n` +
    `Code before the line:\n${before || "(none)"}\n\n` +
    `Code after the line:\n${after || "(none)"}\n\n` +
    `Line to convert:\n${text}`;

  const url = endpoint(config.gemini.model);
  const started = Date.now();
  let thinkingOff = true;
  let r;

  for (let attempt = 1; attempt <= 3; attempt++) {
    r = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompts.CONVERT_INSTRUCTIONS }] },
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

  if (!r.ok) {
    if (r.status !== 429 && r.status !== 503) console.error("Gemini error:", r.status, await r.text());
    throw failFor(r.status);
  }
  const data = await r.json();
  const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!out.trim()) throw new Error("ما رجع كود، جرّب صياغة ثانية");
  return cleanCode(out);
}

// ---------- اتصال مشترك للمحادثات: يجرّب إعداداً دقيقاً، وإن رفضه النموذج (400) ينزل لأبسط ----------
async function askGemini(system, contents, schema) {
  const variants = [
    { temperature: 0.3, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json", responseSchema: schema },
    { temperature: 0.3, responseMimeType: "application/json", responseSchema: schema },
    { temperature: 0.3, responseMimeType: "application/json" },
  ];
  const url = endpoint(config.gemini.chatModel);
  const started = Date.now();
  let vi = 0;
  let r;
  for (let attempt = 1; attempt <= 3; attempt++) {
    r = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: variants[vi] }),
    });
    if (r.status === 400 && vi < variants.length - 1) { vi++; attempt--; continue; }
    if ([500, 502, 503, 504].includes(r.status) && attempt < 3) { await sleep(attempt * 800); continue; }
    break;
  }
  console.log(`زمن محادثة الذكاء: ${Date.now() - started}ms (الحالة ${r.status}، إعداد ${vi})`);

  if (!r.ok) {
    if (r.status !== 429 && r.status !== 503) console.error("Gemini chat error:", r.status, await r.text());
    throw failFor(r.status);
  }
  const data = await r.json();
  const raw = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!raw) throw new Error("ما رجع رد، جرّب صياغة ثانية");
  return raw;
}

const toContents = (messages) => messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

// ---------- محادثة حول أسطر محددة ----------
async function chat({ file, language, startLine, endLine, code, messages }) {
  const system =
    prompts.CHAT_INSTRUCTIONS +
    `\n\nThe student selected lines ${startLine}-${endLine} of the file "${file}" (language: ${language}):\n<selected_code>\n${code}\n</selected_code>`;
  const schema = {
    type: "OBJECT",
    properties: {
      reply: { type: "STRING" },
      suggestions: {
        type: "ARRAY",
        items: { type: "OBJECT", properties: { code: { type: "STRING" }, reason: { type: "STRING" } }, required: ["code", "reason"] },
      },
    },
    required: ["reply", "suggestions"],
  };
  const raw = await askGemini(system, toContents(messages), schema);
  const model = config.gemini.chatModel;
  let out = null;
  try { out = JSON.parse(raw); } catch { out = null; }
  if (!out || typeof out.reply !== "string") return { reply: raw, suggestions: [], model };
  const suggestions = (Array.isArray(out.suggestions) ? out.suggestions : [])
    .filter((x) => x && typeof x.code === "string" && x.code.trim())
    .slice(0, 2)
    .map((x) => ({ code: cleanSuggestion(x.code), reason: String(x.reason || "").slice(0, 300) }));
  return { reply: out.reply, suggestions, model };
}

// ---------- محادثة حول هيكل المشروع (أسماء الملفات والمجلدات فقط) ----------
async function projectChat({ paths, currentFolder, messages }) {
  const system =
    prompts.PROJECT_INSTRUCTIONS +
    `\n\nThe student is currently inside the folder "${currentFolder || "(none)"}".\n\nProject tree (folders end with "/"):\n<project_tree>\n${paths.join("\n")}\n</project_tree>`;
  const schema = {
    type: "OBJECT",
    properties: {
      reply: { type: "STRING" },
      actions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { type: { type: "STRING" }, path: { type: "STRING" }, content: { type: "STRING" }, reason: { type: "STRING" } },
          required: ["type", "path", "reason"],
        },
      },
    },
    required: ["reply", "actions"],
  };
  const raw = await askGemini(system, toContents(messages), schema);
  const model = config.gemini.chatModel;
  let out = null;
  try { out = JSON.parse(raw); } catch { out = null; }
  if (!out || typeof out.reply !== "string") return { reply: raw, actions: [], model };
  const actions = (Array.isArray(out.actions) ? out.actions : [])
    .filter((x) => x && (x.type === "create_folder" || x.type === "create_file") && typeof x.path === "string" && x.path.trim() && x.path.length <= 200)
    .slice(0, 8)
    .map((x) => ({
      type: x.type,
      path: x.path.trim(),
      content: x.type === "create_file" && typeof x.content === "string" ? x.content.slice(0, 20000) : "",
      reason: String(x.reason || "").slice(0, 300),
    }));
  return { reply: out.reply, actions, model };
}

module.exports = { convert, chat, projectChat, cleanCode, cleanSuggestion };
