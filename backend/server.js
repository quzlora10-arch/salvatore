require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const { read, write } = require("./database");
const {
  hashPassword,
  verifyPassword,
  tokenFor,
  authRequired,
  adminRequired
} = require("./auth");
const { sendVerificationCode } = require("./email");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || process.env.FRONTEND_ORIGIN === "*" || !process.env.FRONTEND_ORIGIN) return callback(null, true);
    const allowed = process.env.FRONTEND_ORIGIN.split(",").map(s => s.trim());
    callback(null, allowed.indexOf(origin) !== -1);
  }
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, uploadDir); },
  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(16).toString("hex") + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

const pending = new Map();

function id() {
  return crypto.randomBytes(12).toString("hex");
}
function cleanText(v, max) {
  return String(v || "").trim().slice(0, max);
}
function validEmail(v) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v);
}
function validPassword(v) {
  return typeof v === "string" && v.length >= 8 && v.length <= 128;
}
function now() {
  return new Date().toISOString();
}
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt
  };
}
function ensureAdmin() {
  const data = read();
  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password) return;
  let u = data.users.find(x => x.email === email);
  if (!u) {
    u = {
      id: id(), email, nickname: "Admin", passwordHash: hashPassword(password),
      role: "admin", active: true, verified: true, createdAt: now()
    };
    data.users.push(u);
    write(data);
  } else if (u.role !== "admin") {
    u.role = "admin";
    u.active = true;
    u.verified = true;
    write(data);
  }
}
ensureAdmin();

app.get("/api/health", (req, res) => res.json({ ok: true, name: "Salvatore" }));

app.post("/api/auth/register", async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const nickname = cleanText(req.body.nickname, 30);
  const password = req.body.password;

  if (!validEmail(email)) return res.status(400).json({ error: "Geçerli bir e-posta girin." });
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(nickname)) {
    return res.status(400).json({ error: "Nickname 3-30 karakter olmalı; harf, rakam, _, . ve - kullanılabilir." });
  }
  if (!validPassword(password)) return res.status(400).json({ error: "Şifre en az 8 karakter olmalı." });

  const data = read();
  if (data.users.some(u => u.email === email)) return res.status(409).json({ error: "Bu e-posta zaten kayıtlı." });
  if (data.users.some(u => u.nickname.toLowerCase() === nickname.toLowerCase())) {
    return res.status(409).json({ error: "Bu nickname zaten kullanılıyor." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  pending.set(email, {
    email, nickname, passwordHash: hashPassword(password),
    codeHash: hashPassword(code), expires: Date.now() + 10 * 60 * 1000,
    attempts: 0
  });

  try {
    await sendVerificationCode(email, code);
    res.json({ ok: true, message: "Doğrulama kodu e-posta adresinize gönderildi." });
  } catch (e) {
    pending.delete(email);
    console.error(e);
    res.status(500).json({ error: "E-posta gönderilemedi. SMTP ayarlarını kontrol edin." });
  }
});

app.post("/api/auth/verify", (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const code = cleanText(req.body.code, 10);
  const p = pending.get(email);
  if (!p) return res.status(400).json({ error: "Doğrulama isteği bulunamadı. Yeniden kayıt deneyin." });
  if (Date.now() > p.expires) {
    pending.delete(email);
    return res.status(400).json({ error: "Kodun süresi doldu." });
  }
  if (++p.attempts > 5) {
    pending.delete(email);
    return res.status(429).json({ error: "Çok fazla deneme. Yeniden kod isteyin." });
  }
  if (!verifyPassword(code, p.codeHash)) return res.status(400).json({ error: "Kod hatalı." });

  const data = read();
  const user = {
    id: id(), email, nickname: p.nickname, passwordHash: p.passwordHash,
    role: "user", active: true, verified: true, createdAt: now()
  };
  data.users.push(user);
  data.channels.push({
    id: id(), userId: user.id, name: user.nickname, handle: user.nickname,
    description: "", avatar: "", subscribers: 0, createdAt: now()
  });
  write(data);
  pending.delete(email);

  res.json({ ok: true, user: publicUser(user), token: tokenFor(user) });
});

app.post("/api/auth/login", (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = req.body.password;
  const data = read();
  const user = data.users.find(u => u.email === email);
  if (!user || !verifyPassword(password || "", user.passwordHash)) {
    return res.status(401).json({ error: "E-posta veya şifre hatalı." });
  }
  if (!user.active) return res.status(403).json({ error: "Hesabınız yönetici tarafından devre dışı bırakıldı." });
  if (!user.verified) return res.status(403).json({ error: "E-posta doğrulaması tamamlanmamış." });
  res.json({ ok: true, user: publicUser(user), token: tokenFor(user) });
});

app.get("/api/me", authRequired, (req, res) => {
  const data = read();
  const user = data.users.find(u => u.id === req.auth.id);
  if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  res.json({ user: publicUser(user) });
});

app.get("/api/channels/:handle", (req, res) => {
  const data = read();
  const channel = data.channels.find(c => c.handle.toLowerCase() === cleanText(req.params.handle, 50).toLowerCase());
  if (!channel) return res.status(404).json({ error: "Kanal bulunamadı." });
  const videos = data.videos.filter(v => v.channelId === channel.id && !v.hidden);
  const user = data.users.find(u => u.id === channel.userId);
  res.json({ channel, owner: user ? publicUser(user) : null, videos });
});

app.put("/api/channels/me", authRequired, (req, res) => {
  const data = read();
  const channel = data.channels.find(c => c.userId === req.auth.id);
  if (!channel) return res.status(404).json({ error: "Kanal bulunamadı." });
  channel.name = cleanText(req.body.name, 80) || channel.name;
  channel.description = cleanText(req.body.description, 1000);
  write(data);
  res.json({ ok: true, channel });
});

app.post("/api/videos", authRequired, upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Video dosyası seçin." });
  const data = read();
  const channel = data.channels.find(c => c.userId === req.auth.id);
  if (!channel) return res.status(404).json({ error: "Kanal bulunamadı." });

  const video = {
    id: id(),
    channelId: channel.id,
    title: cleanText(req.body.title, 150) || "Başlıksız video",
    description: cleanText(req.body.description, 5000),
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    views: 0,
    likes: 0,
    hidden: false,
    createdAt: now()
  };
  data.videos.push(video);
  write(data);
  res.json({ ok: true, video });
});

app.get("/uploads/:file", (req, res) => {
  const file = path.basename(req.params.file);
  res.sendFile(path.join(uploadDir, file));
});

app.get("/api/videos/:id", (req, res) => {
  const data = read();
  const video = data.videos.find(v => v.id === req.params.id && !v.hidden);
  if (!video) return res.status(404).json({ error: "Video bulunamadı." });
  video.views += 1;
  write(data);
  const channel = data.channels.find(c => c.id === video.channelId);
  const comments = data.comments.filter(c => c.videoId === video.id);
  res.json({ video, channel, comments });
});

app.get("/api/videos", (req, res) => {
  const q = cleanText(req.query.q, 100).toLowerCase();
  const data = read();
  let videos = data.videos.filter(v => !v.hidden);
  if (q) {
    videos = videos.filter(v => (v.title + " " + v.description).toLowerCase().includes(q));
  }
  videos.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ videos: videos.slice(0, 100) });
});

app.post("/api/videos/:id/like", authRequired, (req, res) => {
  const data = read();
  const video = data.videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: "Video bulunamadı." });
  const exists = data.likes.some(x => x.userId === req.auth.id && x.videoId === video.id);
  if (exists) {
    data.likes = data.likes.filter(x => !(x.userId === req.auth.id && x.videoId === video.id));
  } else {
    data.likes.push({ userId: req.auth.id, videoId: video.id });
  }
  video.likes = data.likes.filter(x => x.videoId === video.id).length;
  write(data);
  res.json({ likes: video.likes, liked: !exists });
});

app.post("/api/videos/:id/comments", authRequired, (req, res) => {
  const text = cleanText(req.body.text, 1000);
  if (!text) return res.status(400).json({ error: "Yorum boş olamaz." });
  const data = read();
  const user = data.users.find(u => u.id === req.auth.id);
  if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  const comment = { id: id(), videoId: req.params.id, userId: user.id, nickname: user.nickname, text, createdAt: now() };
  data.comments.push(comment);
  write(data);
  res.json({ ok: true, comment });
});

app.post("/api/channels/:id/subscribe", authRequired, (req, res) => {
  const data = read();
  const channel = data.channels.find(c => c.id === req.params.id);
  if (!channel) return res.status(404).json({ error: "Kanal bulunamadı." });
  if (channel.userId === req.auth.id) return res.status(400).json({ error: "Kendi kanalınıza abone olamazsınız." });
  const exists = data.subscriptions.some(s => s.userId === req.auth.id && s.channelId === channel.id);
  if (exists) {
    data.subscriptions = data.subscriptions.filter(s => !(s.userId === req.auth.id && s.channelId === channel.id));
  } else {
    data.subscriptions.push({ userId: req.auth.id, channelId: channel.id, createdAt: now() });
  }
  channel.subscribers = data.subscriptions.filter(s => s.channelId === channel.id).length;
  write(data);
  res.json({ subscribed: !exists, subscribers: channel.subscribers });
});

// ADMIN
app.get("/api/admin/users", authRequired, adminRequired, (req, res) => {
  const data = read();
  res.json({ users: data.users.map(publicUser) });
});

app.put("/api/admin/users/:id/status", authRequired, adminRequired, (req, res) => {
  const data = read();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  if (user.role === "admin") return res.status(400).json({ error: "Admin hesabı buradan kapatılamaz." });
  user.active = Boolean(req.body.active);
  write(data);
  res.json({ ok: true, user: publicUser(user) });
});

app.put("/api/admin/users/:id/password", authRequired, adminRequired, (req, res) => {
  const password = req.body.password;
  if (!validPassword(password)) return res.status(400).json({ error: "Yeni şifre en az 8 karakter olmalı." });
  const data = read();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  user.passwordHash = hashPassword(password);
  write(data);
  res.json({ ok: true, message: "Kullanıcı şifresi değiştirildi." });
});

app.delete("/api/admin/users/:id", authRequired, adminRequired, (req, res) => {
  const data = read();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  if (user.role === "admin") return res.status(400).json({ error: "Admin hesabı silinemez." });

  const channelIds = data.channels.filter(c => c.userId === user.id).map(c => c.id);
  const videoIds = data.videos.filter(v => channelIds.indexOf(v.channelId) !== -1).map(v => v.id);

  data.users = data.users.filter(u => u.id !== user.id);
  data.channels = data.channels.filter(c => c.userId !== user.id);
  data.videos = data.videos.filter(v => videoIds.indexOf(v.id) === -1);
  data.comments = data.comments.filter(c => c.userId !== user.id && videoIds.indexOf(c.videoId) === -1);
  data.subscriptions = data.subscriptions.filter(s => s.userId !== user.id && channelIds.indexOf(s.channelId) === -1);
  data.likes = data.likes.filter(l => l.userId !== user.id && videoIds.indexOf(l.videoId) === -1);
  write(data);

  res.json({ ok: true });
});

app.get("/api/admin/stats", authRequired, adminRequired, (req, res) => {
  const data = read();
  res.json({
    users: data.users.length,
    channels: data.channels.length,
    videos: data.videos.length,
    comments: data.comments.length
  });
});

// Serve frontend when deployed as one application.
const frontend = path.join(__dirname, "..", "frontend");
app.use(express.static(frontend));
app.get("*", (req, res) => {
  if (req.path.indexOf("/api/") === 0) return res.status(404).json({ error: "API endpoint bulunamadı." });
  res.sendFile(path.join(frontend, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Salvatore çalışıyor: http://localhost:${PORT}`);
});
