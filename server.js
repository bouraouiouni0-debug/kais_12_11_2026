const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;
const ESP_KEY = process.env.ESP_KEY || "esp1234";        // même valeur que ESP_KEY dans le sketch
const PAGE_PASSWORD = process.env.PAGE_PASSWORD || "";   // optionnel : protège la page

let toEsp = [];     // messages navigateur -> ESP32
let fromEsp = [];   // messages ESP32 -> navigateur
let lcdText = "";   // dernier contenu du LCD
let lastSeen = 0;   // dernier contact de l'ESP32

// ---------- Mot de passe optionnel (pas pour /api/esp/...) ----------
app.use((req, res, next) => {
  if (!PAGE_PASSWORD || req.path.startsWith("/api/esp/")) return next();
  const h = req.headers.authorization || "";
  const [scheme, b64] = h.split(" ");
  if (scheme === "Basic" && b64) {
    const pass = Buffer.from(b64, "base64").toString().split(":").slice(1).join(":");
    if (pass === PAGE_PASSWORD) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="ESP32"').status(401).send("Password required");
});

function checkKey(req, res) {
  if (req.headers["x-api-key"] !== ESP_KEY) {
    res.status(401).send("bad key");
    return false;
  }
  return true;
}

// =====================================================
// CÔTÉ ESP32
// =====================================================

// Poll : renvoie les messages en attente, un par ligne
app.get("/api/esp/poll", (req, res) => {
  if (!checkKey(req, res)) return;
  lastSeen = Date.now();
  const msgs = toEsp.join("\n");
  toEsp = [];
  res.type("text/plain").send(msgs);
});

// Message texte de l'ESP32 vers la page
app.post("/api/esp/message", express.text({ type: "*/*", limit: "10kb" }), (req, res) => {
  if (!checkKey(req, res)) return;
  lastSeen = Date.now();
  const t = String(req.body || "").trim();
  if (t) fromEsp.push(t);
  res.send("ok");
});

// Contenu du LCD envoyé par l'ESP32
app.post("/api/esp/lcd", express.text({ type: "*/*", limit: "2kb" }), (req, res) => {
  if (!checkKey(req, res)) return;
  lastSeen = Date.now();
  lcdText = String(req.body || "");
  res.send("ok");
});

// =====================================================
// CÔTÉ NAVIGATEUR
// =====================================================

app.get("/api/send", (req, res) => {
  const msg = String(req.query.msg || "").replace(/[\r\n]+/g, " ").slice(0, 200);
  if (!msg) return res.status(400).send("Missing message");
  toEsp.push(msg);
  res.send("Message sent to ESP32");
});

app.get("/api/receive", (req, res) => {
  res.type("text/plain").send(fromEsp.shift() || "");
});

app.get("/api/lcd", (req, res) => {
  res.set("Cache-Control", "no-store").type("text/plain").send(lcdText);
});

app.get("/api/status", (req, res) => {
  res.json({ online: Date.now() - lastSeen < 7000 });
});

app.use(express.static("public"));

app.listen(PORT, () => console.log("Server running on port " + PORT));
