import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ESM path yardımcıları
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// public/ klasörünü servis et
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Kök URL -> index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// DEBUG: public yolu ve index var mı?
app.get("/__debug", (_req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  res.json({
    __dirname,
    publicDir,
    indexPath,
    indexExists: fs.existsSync(indexPath),
  });
});

// RAM içi durum
let latest = null;
const history = [];

// Sadece POST'ta API key
function checkApiKey(req, res, next) {
  const key = req.header("x-api-key");
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: "API key hatalı" });
  }
  next();
}

// Sağlık
app.get("/health", (_req, res) => res.json({ ok: true }));

// Veri yaz (ESP)
app.post("/data", checkApiKey, (req, res) => {
  const { sensor, value } = req.body || {};
  if (typeof sensor !== "string" || typeof value !== "number") {
    return res.status(400).json({ ok:false, error:"sensor(string) ve value(number) zorunlu" });
  }
  latest = { sensor, value, ts: Date.now() };
  history.push(latest);
  if (history.length > 5000) history.shift();
  res.json({ ok:true, latest });
});

// En son veri
app.get("/data/latest", (_req, res) => res.json({ ok:true, latest }));

// Geçmiş
app.get("/data/history", (_req, res) => res.json({ ok:true, count:history.length, history }));

// SSE
app.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  if (latest) res.write(`event:init\ndata:${JSON.stringify(latest)}\n\n`);
  let lastTs = latest?.ts || 0;
  const t = setInterval(() => {
    if (latest && latest.ts !== lastTs) {
      res.write(`data:${JSON.stringify(latest)}\n\n`);
      lastTs = latest.ts;
    }
  }, 400);
  req.on("close", () => clearInterval(t));
});

// Hata yakalayıcı
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok:false, error:"Sunucu hatası" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("API running on :" + port);
});
