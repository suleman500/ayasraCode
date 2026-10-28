// bridge.js — الجسر المحلي: بيربط صفحة الموقع بملفات مشروعك وبايثون وVS Code على جهازك.
// بيتحمّل من server.js تلقائياً (ما بتشغّله لحاله). بدون أي مكتبات خارجية.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const STATE_FILE = path.join(__dirname, "bridge-state.json");
// الأنواع المسموح قراءتها وكتابتها (نفس أنواع المنصة). أي شي ثاني (.exe, .bat, .ps1 ...) مرفوض.
const TEXT_EXT = new Set(["py", "js", "mjs", "jsx", "dart", "ts", "tsx", "json", "html", "htm", "css", "md", "markdown", "txt", "yml", "yaml"]);
const RUN_EXT = { py: "python", js: "javascript", mjs: "javascript", dart: "dart" };
const IGNORE = new Set(["node_modules", "__pycache__", "venv", "dist", "build", "target"]);
const MAX_FILES = 200, MAX_BYTES = 1000000;
const RUN_TIMEOUT = Number(process.env.RUN_TIMEOUT_MS) || 60000;
const RUN_MAX_OUT = 1000000;

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const ext = (p) => path.extname(p).slice(1).toLowerCase();
const stripBom = (s) => s.replace(/^\uFEFF/, "");

function create({ host, port }) {
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  const token = crypto.randomBytes(24).toString("hex");
  let root = null;
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (s.root && fs.statSync(s.root).isDirectory()) root = s.root;
  } catch (e) {}

  // ---------- SSE: بث الأحداث للصفحة ----------
  const clients = new Set();
  const broadcast = (obj) => { const d = "data: " + JSON.stringify(obj) + "\n\n"; clients.forEach((r) => { try { r.write(d); } catch (e) {} }); };
  setInterval(() => clients.forEach((r) => { try { r.write(": ping\n\n"); } catch (e) {} }), 20000).unref();

  // ---------- مراقبة المجلد ----------
  let watcher = null, wTimer = null;
  const recent = new Map();   // ملفات كتبناها نحن قبل لحظات: ما نبلّغ عنها كتغيير خارجي
  function schedule() { clearTimeout(wTimer); wTimer = setTimeout(() => broadcast({ type: "changed" }), 250); }
  function stopWatch() { if (watcher) { try { watcher.close(); } catch (e) {} watcher = null; } }
  function startWatch() {
    stopWatch();
    if (!root) return;
    try {
      watcher = fs.watch(root, { recursive: true }, (evt, fn) => {
        if (!fn) { schedule(); return; }
        const rel = String(fn).split(path.sep).join("/");
        if (rel.split("/").some((s) => s.startsWith(".") || IGNORE.has(s))) return;
        const t = recent.get(rel);
        if (t && Date.now() - t < 600) return;
        schedule();
      });
      watcher.on("error", () => {});
    } catch (e) { console.error("مراقبة المجلد:", e.message); }
  }
  function setRoot(p) {
    const abs = path.resolve(String(p || "").trim().replace(/^"|"$/g, ""));
    let st;
    try { st = fs.statSync(abs); } catch (e) { throw httpErr(400, "المسار غير موجود: " + abs); }
    if (!st.isDirectory()) throw httpErr(400, "هذا مش مجلد: " + abs);
    if (path.parse(abs).root === abs) throw httpErr(400, "ما بنقبل جذر القرص كمجلد مشروع. اختر مجلداً داخله.");
    root = abs;
    try { fs.writeFileSync(STATE_FILE, JSON.stringify({ root }), "utf8"); } catch (e) {}
    startWatch();
    broadcast({ type: "root" });
    return root;
  }
  if (root) startWatch();

  // ---------- أمان المسارات ----------
  function safe(rel) {
    if (!root) throw httpErr(400, "ما في مجلد مشروع. اختر مجلداً أولاً.");
    rel = String(rel || "").replace(/\\/g, "/");
    if (rel.includes(":") || rel.split("/").some((s) => s === "..")) throw httpErr(400, "مسار غير صالح");
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) throw httpErr(400, "المسار برّا المشروع");
    return abs;
  }
  const allowedFile = (abs) => TEXT_EXT.has(ext(abs));

  function walk(dirAbs, rel, out) {
    for (const e of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const r = rel ? rel + "/" + e.name : e.name, abs = path.join(dirAbs, e.name);
      if (e.isDirectory()) {
        if (IGNORE.has(e.name)) continue;
        out.folders.push(r);
        walk(abs, r, out);
      } else if (e.isFile() && TEXT_EXT.has(ext(e.name))) {
        if (fs.statSync(abs).size > MAX_BYTES) { out.skipped++; continue; }
        if (out.files.length >= MAX_FILES) { out.truncated = true; continue; }
        out.files.push({ path: r, code: stripBom(fs.readFileSync(abs, "utf8")) });
      } else out.skipped++;
    }
  }

  // ---------- نافذة اختيار المجلد (ويندوز) ----------
  function pickFolder() {
    return new Promise((resolve, reject) => {
      if (process.platform !== "win32") return reject(httpErr(501, "نافذة الاختيار متاحة بويندوز فقط. استخدم «اكتب المسار»."));
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
        "$f = New-Object System.Windows.Forms.Form",
        "$f.TopMost = $true; $f.ShowInTaskbar = $false; $f.Opacity = 0; $f.StartPosition = 'CenterScreen'",
        "$f.Show()",
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
        "$d.Description = 'اختر مجلد المشروع'",
        "$d.ShowNewFolderButton = $true",
        "$r = $d.ShowDialog($f)",
        "$f.Close()",
        "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }"
      ].join("\n");
      const p = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true });
      let out = "";
      p.stdout.setEncoding("utf8");
      p.stdout.on("data", (d) => { out += d; });
      p.on("error", (e) => reject(httpErr(500, e.message)));
      p.on("close", () => resolve(out.replace(/\uFEFF/g, "").trim()));
    });
  }

  // ---------- تشغيل الكود ----------
  let run = null;
  function killTree(p) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true });
      else p.kill("SIGKILL");
    } catch (e) {}
  }
  function stopRun() { if (run && !run.ended) { run.killed = "stopped"; killTree(run.p); } }
  function startRun(rel) {
    const abs = safe(rel), kind = RUN_EXT[ext(abs)];
    if (!kind) throw httpErr(400, "هذا النوع من الملفات ما بينشغّل: ." + ext(abs));
    if (!fs.existsSync(abs)) throw httpErr(404, "الملف غير موجود على القرص. احفظه أولاً.");
    if (run && !run.ended) { stopRun(); }
    const cands = kind === "python" ? [["python", ["-u"]], ["py", ["-u"]], ["python3", ["-u"]]] : kind === "javascript" ? [["node", []]] : [["dart", ["run"]]];
    const id = crypto.randomBytes(6).toString("hex"), t0 = Date.now();
    const env = Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" });
    const arg = "." + path.sep + path.relative(root, abs);
    let ci = 0;
    const cur = { id, p: null, ended: false, killed: null, bytes: 0 };
    run = cur;
    const finish = (code) => {
      if (cur.ended) return;
      cur.ended = true; clearTimeout(cur.timer);
      broadcast({ type: "run-end", id, code, killed: cur.killed, ms: Date.now() - t0 });
    };
    const out = (stream, text) => {
      cur.bytes += text.length;
      if (cur.bytes > RUN_MAX_OUT) { if (!cur.killed) { cur.killed = "output"; killTree(cur.p); broadcast({ type: "run-out", id, stream: "stderr", text: "\n[تم إيقاف التشغيل: المخرجات كبيرة جداً]\n" }); } return; }
      broadcast({ type: "run-out", id, stream, text });
    };
    const launch = () => {
      const [cmd, pre] = cands[ci];
      const p = spawn(cmd, pre.concat([arg]), { cwd: root, env, windowsHide: true });
      cur.p = p;
      if (ci === 0) broadcast({ type: "run-start", id, cmd: cmd + " " + pre.concat([arg]).join(" ") });
      p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
      p.stdout.on("data", (d) => out("stdout", d));
      p.stderr.on("data", (d) => out("stderr", d));
      p.stdin.on("error", () => {});
      p.on("error", (err) => {
        p.__failed = true;
        if (err.code === "ENOENT" && ci < cands.length - 1) { ci++; launch(); return; }
        broadcast({ type: "run-start", id, cmd: cmd });
        broadcast({ type: "run-out", id, stream: "stderr", text: err.code === "ENOENT" ? "ما لقيت المشغّل «" + cmd + "» على جهازك. تأكد إنه منصّب وموجود بـ PATH.\n" : String(err.message) + "\n" });
        finish(-1);
      });
      p.on("close", (code) => { if (p.__failed) return; finish(code); });
    };
    cur.timer = setTimeout(() => { if (!cur.ended) { cur.killed = "timeout"; killTree(cur.p); } }, RUN_TIMEOUT);
    launch();
    return id;
  }

  // ---------- فتح VS Code ----------
  function openCode(rel) {
    if (!root) throw httpErr(400, "ما في مجلد مشروع.");
    const args = ['"' + root + '"'];
    if (rel) args.push("-g", '"' + safe(rel) + '"');
    const p = spawn("code", args, { shell: true, detached: true, stdio: "ignore", windowsHide: true });
    p.on("error", () => {});
    p.unref();
  }

  // ---------- الحماية: رمز سري + فحص Host و Origin ----------
  function authorized(req, url) {
    const h = String(req.headers.host || "").toLowerCase();
    if (![`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(h)) return false;
    const origin = req.headers.origin;
    if (origin && origin !== "http://" + h) return false;
    const t = String(req.headers["x-aysar-token"] || url.searchParams.get("t") || "");
    const a = Buffer.from(t), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function readJson(req, limit) {
    return new Promise((resolve, reject) => {
      let n = 0; const chunks = [];
      req.on("data", (c) => { n += c.length; if (n > limit) { reject(httpErr(413, "الطلب كبير جداً")); req.destroy(); return; } chunks.push(c); });
      req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { reject(httpErr(400, "JSON غير صالح")); } });
      req.on("error", reject);
    });
  }
  const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };

  async function handle(req, res, url) {
    try {
      if (!authorized(req, url)) return send(res, 403, { error: "غير مصرّح" });
      const r = url.pathname.slice("/api/bridge/".length), q = url.searchParams, m = req.method;

      if (m === "GET" && r === "events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": ok\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (m === "GET" && r === "state") return send(res, 200, { root: root || "", name: root ? path.basename(root) : "", platform: process.platform, node: process.version });
      if (m === "GET" && r === "tree") {
        safe("");
        const out = { root, name: path.basename(root), folders: [], files: [], skipped: 0, truncated: false };
        walk(root, "", out);
        return send(res, 200, out);
      }
      if (m === "GET" && r === "ls") {
        const abs = safe(q.get("path") || "");
        const entries = [];
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
          if (e.name.startsWith(".")) continue;
          if (e.isDirectory()) { if (!IGNORE.has(e.name)) entries.push({ name: e.name, kind: "directory" }); }
          else if (e.isFile() && TEXT_EXT.has(ext(e.name))) entries.push({ name: e.name, kind: "file", size: fs.statSync(path.join(abs, e.name)).size });
        }
        return send(res, 200, { entries });
      }
      if (m === "GET" && r === "read") {
        const abs = safe(q.get("path"));
        if (!allowedFile(abs)) throw httpErr(400, "نوع الملف غير مسموح");
        const st = fs.statSync(abs);
        if (st.size > MAX_BYTES * 2) throw httpErr(413, "الملف كبير");
        return send(res, 200, { content: stripBom(fs.readFileSync(abs, "utf8")), size: st.size, mtimeMs: st.mtimeMs });
      }

      if (m !== "POST") return send(res, 404, { error: "غير موجود" });
      const body = await readJson(req, 6 * 1024 * 1024);

      if (r === "pick-folder") {
        const p = await pickFolder();
        if (!p) return send(res, 200, { cancelled: true });
        return send(res, 200, { root: setRoot(p), name: path.basename(root) });
      }
      if (r === "set-root") return send(res, 200, { root: setRoot(body.path), name: path.basename(root) });
      if (r === "write") {
        const abs = safe(body.path);
        if (!allowedFile(abs)) throw httpErr(400, "نوع الملف غير مسموح");
        if (typeof body.content !== "string") throw httpErr(400, "المحتوى مطلوب");
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, body.content, "utf8");
        recent.set(path.relative(root, abs).split(path.sep).join("/"), Date.now());
        return send(res, 200, { ok: true, mtimeMs: fs.statSync(abs).mtimeMs });
      }
      if (r === "mkdir") {
        const abs = safe(body.path);
        fs.mkdirSync(abs, { recursive: true });
        recent.set(path.relative(root, abs).split(path.sep).join("/"), Date.now());
        return send(res, 200, { ok: true });
      }
      if (r === "delete") {
        const abs = safe(body.path);
        if (abs === root) throw httpErr(400, "ما بنحذف مجلد المشروع نفسه");
        const st = fs.statSync(abs);
        if (st.isDirectory()) fs.rmdirSync(abs);          // بس لو فاضي
        else if (allowedFile(abs)) fs.unlinkSync(abs);
        else throw httpErr(400, "نوع الملف غير مسموح");
        recent.set(path.relative(root, abs).split(path.sep).join("/"), Date.now());
        return send(res, 200, { ok: true });
      }
      if (r === "clear-root") {
        stopRun(); stopWatch(); root = null;
        try { fs.writeFileSync(STATE_FILE, "{}", "utf8"); } catch (e) {}
        broadcast({ type: "root" });
        return send(res, 200, { ok: true });
      }
      if (r === "run") return send(res, 200, { id: startRun(body.path) });
      if (r === "stop") { stopRun(); return send(res, 200, { ok: true }); }
      if (r === "stdin") {
        if (!run || run.ended || run.id !== body.id) throw httpErr(400, "ما في تشغيل شغّال");
        run.p.stdin.write(String(body.text || "") + "\n");
        return send(res, 200, { ok: true });
      }
      if (r === "open-vscode") { openCode(body.path || ""); return send(res, 200, { ok: true }); }
      return send(res, 404, { error: "غير موجود" });
    } catch (err) {
      send(res, err.status || 500, { error: err.message || "خطأ" });
    }
  }

  // نحط الرمز السري داخل الصفحة (بس صفحتنا بتقدر تقراه، المواقع الثانية لا)
  function injectToken(html) {
    const tag = "<script>window.__AYSAR_BRIDGE=" + JSON.stringify({ token }) + ";</script>\n";
    const s = html.toString("utf8"), i = s.indexOf("<script");
    return i === -1 ? s + tag : s.slice(0, i) + tag + s.slice(i);
  }

  return { enabled: loopback, token, handle, injectToken, setRoot, stop: () => { stopWatch(); stopRun(); } };
}

module.exports = { create };
