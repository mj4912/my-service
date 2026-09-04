// 내 컴퓨터에서 먼저 확인해 보기 위한 연습용 서버입니다.
// (Vercel에 올리면 이 파일은 쓰이지 않습니다. Vercel이 같은 일을 대신 합니다.)
//
//   실행 : node dev-server.js
//   주소 : http://localhost:3000
//
// .env 파일에서 열쇠를 읽어 api/draft.js 에 넘겨줍니다.
// 열쇠는 서버 쪽에만 있고 화면 소스에는 나가지 않습니다.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = 3000;

// ── .env 읽기 (따로 설치할 것 없이 직접 읽습니다) ───────────────
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const at = t.indexOf("=");
    if (at < 1) return;
    const name = t.slice(0, at).trim();
    const value = t.slice(at + 1).trim().replace(/^["']|["']$/g, "");
    if (value) process.env[name] = value;
  });
}
loadEnv();

const draftHandler = require("./api/draft.js");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg"
};

// Vercel이 해 주는 편의 기능(res.status / res.json)을 흉내 냅니다
function dress(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

const server = http.createServer((req, res) => {
  dress(res);

  // ── /api/draft — 초안 만들기 ──────────────────────────────
  if (req.url.split("?")[0] === "/api/draft") {
    // 한글이 깨지지 않도록 조각을 모은 뒤 한 번에 UTF-8로 풉니다
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 200000) return req.destroy();
      chunks.push(c);
    });
    req.on("end", () => {
      req.body = Buffer.concat(chunks).toString("utf8");
      Promise.resolve(draftHandler(req, res)).catch((e) => {
        console.error(e);
        if (!res.writableEnded) res.status(500).json({ error: "서버 안에서 문제가 났습니다." });
      });
    });
    return;
  }

  // ── 그 밖에는 파일 그대로 보내기 ──────────────────────────
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";

  const file = path.join(ROOT, rel);
  // 폴더 밖 파일과 숨김 파일(.env 등)은 내보내지 않습니다
  if (!file.startsWith(ROOT) || path.basename(file).startsWith(".")) {
    return res.status(403).end("볼 수 없는 파일입니다.");
  }

  fs.readFile(file, (err, data) => {
    if (err) return res.status(404).end("그런 파일이 없습니다.");
    res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
    res.end(data);
  });
});

server.listen(PORT, () => {
  const ok = process.env.GEMINI_API_KEY ? "열쇠 읽음 ✓" : "열쇠 없음 ✗ (.env 확인 필요)";
  console.log(`\n  연습용 서버가 켜졌습니다 — ${ok}`);
  console.log(`  주소 : http://localhost:${PORT}`);
  console.log(`  끄기 : 이 창에서 Ctrl+C\n`);
});
