const API = (window.SALVATORE_CONFIG || {}).API_BASE || "";
const tokenKey = "salvatore_token";
const userKey = "salvatore_user";

function token() { return localStorage.getItem(tokenKey) || ""; }
function currentUser() {
  try { return JSON.parse(localStorage.getItem(userKey) || "null"); } catch(e) { return null; }
}
function setSession(data) {
  localStorage.setItem(tokenKey, data.token);
  localStorage.setItem(userKey, JSON.stringify(data.user));
}
function logout() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
  location.href = "index.html";
}
async function api(path, options) {
  options = options || {};
  options.headers = options.headers || {};
  if (token()) options.headers.Authorization = "Bearer " + token();
  if (!(options.body instanceof FormData) && options.body && typeof options.body === "object") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const r = await fetch(API + path, options);
  let data = {};
  try { data = await r.json(); } catch(e) {}
  if (!r.ok) throw new Error(data.error || "Bir hata oluştu.");
  return data;
}
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function(c) {
    return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[c];
  });
}
function requireLogin() {
  if (!token()) { location.href = "login.html"; return false; }
  return true;
}
function nav() {
  const u = currentUser();
  const box = document.getElementById("userBox");
  if (!box) return;
  box.innerHTML = u
    ? `<span>@${esc(u.nickname)}</span> ${u.role === "admin" ? '<a href="admin.html">Yönetim</a>' : ''}<button onclick="logout()">Çıkış</button>`
    : `<a href="login.html">Giriş</a><a class="primary" href="register.html">Hesap oluştur</a>`;
}
function videoCard(v) {
  return `<a class="video-card" href="watch.html?id=${encodeURIComponent(v.id)}">
    <div class="thumb"><span>▶</span></div>
    <div class="v-title">${esc(v.title)}</div>
    <div class="muted">${Number(v.views || 0).toLocaleString("tr-TR")} görüntüleme</div>
  </a>`;
}
document.addEventListener("DOMContentLoaded", nav);
