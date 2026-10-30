const fs = require("fs");
const path = require("path");
const config = require("../config/env");
const { authenticate } = require("../middlewares/auth");

const file = (name) => path.join(config.frontendDir, name);

function health(req, res) { res.type("text").send("ok"); }

async function loginPage(req, res, next) {
  try {
    if (await authenticate(req)) return res.redirect("/");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(file("login.html"));
  } catch (err) { next(err); }
}

// ملف إعداد الواجهة (عنوان الـ API). عام ولا يحوي أسراراً.
function configJs(req, res) {
  res.setHeader("Cache-Control", "no-cache");
  res.type("application/javascript").sendFile(file("config.js"));
}

// المحرر نفسه: يمرّ عبر authRequired قبل الوصول هنا
const indexPage = (bridge) => (req, res) => {
  let html = fs.readFileSync(file("index.html"));
  if (bridge.enabled) html = bridge.injectToken(html);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
};

// ملفات الأصوات (اختيارية): ضع الملفات في frontend/sounds
function sounds(req, res) {
  const dir = path.join(config.frontendDir, "sounds");
  const name = req.params.name;
  const types = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg" };
  const roles = ["click", "key", "enter", "backspace", "space", "start", "thinking", "success", "error", "deny"];
  if (name === "index.json") {
    const map = {};
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        const ext = path.extname(f).toLowerCase();
        const base = path.basename(f, path.extname(f)).toLowerCase();
        if (types[ext] && roles.includes(base)) map[base] = f;
      }
    }
    res.setHeader("Cache-Control", "no-cache");
    return res.json(map);
  }
  const ext = path.extname(name).toLowerCase();
  if (/^[A-Za-z0-9_.-]+$/.test(name) && types[ext] && fs.existsSync(path.join(dir, name))) {
    res.setHeader("Content-Type", types[ext]);
    res.setHeader("Cache-Control", "no-cache");
    return res.send(fs.readFileSync(path.join(dir, name)));
  }
  res.status(404).send("Not found");
}

module.exports = { health, loginPage, configJs, indexPage, sounds };
