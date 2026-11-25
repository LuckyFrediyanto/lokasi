export const DASHBOARD_HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>Lacak HP — iOS & Android Realtime</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  :root { --bg:#0f172a; --card:#1e293b; --line:#334155; --text:#f8fafc; --muted:#94a3b8; --blue:#38bdf8; --green:#22c55e; --red:#ef4444; }
  * { box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  html,body { margin:0; padding:0; height:100%; background:var(--bg); color:var(--text); overflow:hidden; }
  .hidden { display:none !important; }
  #loginView { height:100%; display:flex; align-items:center; justify-content:center; padding:20px; }
  .box { width:100%; max-width:360px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; }
  h1 { margin:0 0 6px; font-size:20px; }
  p.sub { margin:0 0 18px; color:var(--muted); font-size:13px; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input,select { width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:#0b1220; color:var(--text); font-size:14px; }
  button { cursor:pointer; border:0; border-radius:10px; padding:10px 14px; font-weight:600; font-size:13px; color:#0b1220; background:var(--blue); }
  button.sec { background:#334155; color:var(--text); }
  button.danger { background:var(--red); color:#fff; }
  button.full { width:100%; margin-top:16px; padding:12px; font-size:14px; }
  .err { color:#fca5a5; font-size:12px; margin-top:10px; min-height:16px; }
  #appView { height:100%; display:flex; flex-direction:column; }
  header { height:56px; background:var(--card); border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; padding:0 14px; gap:8px; z-index:500; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:700; font-size:15px; }
  .dot { width:9px; height:9px; border-radius:50%; background:var(--red); display:inline-block; }
  .dot.ok { background:var(--green); }
  .actions { display:flex; gap:6px; align-items:center; }
  .actions button { padding:7px 10px; font-size:12px; }
  main { flex:1; display:flex; position:relative; overflow:hidden; }
  #map { flex:1; height:100%; }
  aside { width:320px; background:var(--card); border-left:1px solid var(--line); overflow:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
  @media (max-width:768px) {
    main { flex-direction:column; }
    aside { width:100%; height:42%; border-left:0; border-top:1px solid var(--line); }
  }
  .dev { background:#0b1220; border:1px solid var(--line); border-radius:12px; padding:10px 12px; }
  .dev-top { display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .dev-name { font-weight:700; font-size:14px; }
  .badge { font-size:11px; padding:2px 7px; border-radius:999px; background:#334155; color:var(--text); text-transform:uppercase; }
  .badge.ios { background:#1d4ed8; }
  .badge.android { background:#15803d; }
  .meta { font-size:12px; color:var(--muted); margin-top:4px; line-height:1.4; }
  .dev-btns { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
  .dev-btns button { padding:5px 9px; font-size:11px; }
  .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center; padding:16px; z-index:1000; }
  .modal { width:100%; max-width:420px; max-height:85vh; overflow:auto; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; }
  .user-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px; }
  .pin-label { background:#0f172a; color:#fff; border:2px solid #38bdf8; border-radius:999px; padding:3px 9px; font-weight:700; font-size:12px; white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,.45); }
</style>
</head>
<body>
<div id="loginView">
  <form class="box" id="loginForm">
    <h1>Lacak HP Realtime</h1>
    <p class="sub">Gabungan iOS &amp; Android dalam satu peta</p>
    <label for="u">Username</label>
    <input id="u" autocomplete="username" required placeholder="admin" />
    <label for="p">Password</label>
    <input id="p" type="password" autocomplete="current-password" required placeholder="••••••" />
    <button class="full" type="submit">Masuk</button>
    <div class="err" id="loginErr"></div>
  </form>
</div>

<div id="appView" class="hidden">
  <header>
    <div class="brand">
      <span class="dot" id="wsDot"></span>
      <span id="meLabel">Lacak HP</span>
    </div>
    <div class="actions">
      <button class="sec" id="shareBtn" type="button">Kirim Lokasi Ini</button>
      <button class="sec hidden" id="adminBtn" type="button">Kelola User</button>
      <button class="danger" id="logoutBtn" type="button">Keluar</button>
    </div>
  </header>
  <main>
    <div id="map"></div>
    <aside id="deviceList"></aside>
  </main>
</div>

<div id="adminModal" class="modal-bg hidden">
  <div class="modal">
    <div class="dev-top" style="margin-bottom:10px">
      <strong>Kelola User</strong>
      <button class="sec" id="closeAdmin" type="button">Tutup</button>
    </div>
    <form id="addUserForm">
      <label>Username baru</label>
      <input id="newU" required placeholder="iphone-saya" />
      <label>Password (min 6 karakter)</label>
      <input id="newP" type="password" required />
      <label>Role</label>
      <select id="newR"><option value="user">User</option><option value="admin">Admin</option></select>
      <button class="full" type="submit">Tambah User</button>
      <div class="err" id="adminErr"></div>
    </form>
    <div id="usersList" style="margin-top:14px"></div>
  </div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const LS_TOKEN = "lacak_token";
let token = localStorage.getItem(LS_TOKEN) || "";
let me = null;
let ws = null;
let map = null;
let markers = new Map();
let devices = new Map();
let trailLayer = null;
let trailDeviceId = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function ago(ts) {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 10) return "baru saja";
  if (sec < 60) return sec + "d lalu";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + "m lalu";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "j lalu";
  return Math.floor(hr / 24) + "h lalu";
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  return data;
}

function initMap() {
  if (map) return;
  map = L.map("map").setView([-6.8, 110.84], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);
}

function upsertMarker(d) {
  devices.set(d.device_id, d);
  const icon = L.divIcon({
    className: "",
    html: '<div class="pin-label">' + esc(d.username) + " · " + esc(d.platform.toUpperCase()) + "</div>",
    iconAnchor: [40, 14]
  });
  if (markers.has(d.device_id)) {
    const m = markers.get(d.device_id);
    m.setLatLng([d.lat, d.lng]).setIcon(icon);
  } else {
    const m = L.marker([d.lat, d.lng], { icon }).addTo(map);
    markers.set(d.device_id, m);
  }
  renderDevices();
}

function removeDevice(deviceId) {
  devices.delete(deviceId);
  if (markers.has(deviceId)) {
    map.removeLayer(markers.get(deviceId));
    markers.delete(deviceId);
  }
  if (trailDeviceId === deviceId && trailLayer) {
    map.removeLayer(trailLayer);
    trailLayer = null;
    trailDeviceId = null;
  }
  renderDevices();
}

function renderDevices() {
  const list = document.getElementById("deviceList");
  const arr = Array.from(devices.values()).sort((a, b) => b.updated_at - a.updated_at);
  if (!arr.length) {
    list.innerHTML = '<div class="meta">Belum ada HP mengirim lokasi. Login di aplikasi iOS/Android atau klik "Kirim Lokasi Ini".</div>';
    return;
  }
  list.innerHTML = arr.map((d) => {
    const online = Date.now() - d.updated_at < 120000;
    const bat = d.battery != null ? Math.round(d.battery) + "%" + (d.charging ? " ⚡" : "") : "-";
    const acc = d.accuracy != null ? Math.round(d.accuracy) + "m" : "-";
    return '<div class="dev">' +
      '<div class="dev-top"><span class="dev-name">' + esc(d.username) + '</span><span class="badge ' + esc(d.platform) + '">' + esc(d.platform) + '</span></div>' +
      '<div class="meta">' + esc(d.device_name) + '<br>' +
      (online ? "● Online" : "○ Terakhir") + " " + ago(d.updated_at) + " · Baterai " + bat + " · Akurasi " + acc + '<br>' +
      d.lat.toFixed(6) + ", " + d.lng.toFixed(6) + '</div>' +
      '<div class="dev-btns">' +
      '<button type="button" onclick="focusDev(\\'' + esc(d.device_id) + '\\')">Fokus</button>' +
      '<button class="sec" type="button" onclick="toggleTrail(\\'' + esc(d.device_id) + '\\')">Jejak</button>' +
      '<button class="sec" type="button" onclick="openRoute(' + d.lat + ',' + d.lng + ')">Rute</button>' +
      '<button class="sec" type="button" onclick="pingDev(\\'' + esc(d.device_id) + '\\')">Bunyikan</button>' +
      '</div></div>';
  }).join("");
}

window.focusDev = (id) => {
  const d = devices.get(id);
  if (d && map) map.setView([d.lat, d.lng], 17);
};

window.openRoute = (lat, lng) => {
  window.open("https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng, "_blank");
};

window.toggleTrail = async (id) => {
  if (trailLayer) { map.removeLayer(trailLayer); trailLayer = null; }
  if (trailDeviceId === id) { trailDeviceId = null; return; }
  trailDeviceId = id;
  const data = await api("/api/locations/" + encodeURIComponent(id) + "/history");
  if (!data.points.length) return;
  const latlngs = data.points.map((p) => [p.lat, p.lng]);
  trailLayer = L.polyline(latlngs, { color: "#38bdf8", weight: 4 }).addTo(map);
  map.fitBounds(trailLayer.getBounds(), { padding: [30, 30] });
};

window.pingDev = async (id) => {
  await api("/api/locations/" + encodeURIComponent(id) + "/ping", { method: "POST" });
  alert("Sinyal bunyikan dikirim ke perangkat");
};

function connectWs() {
  if (ws) { try { ws.close(); } catch {} }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(proto + "//" + location.host + "/api/ws?token=" + encodeURIComponent(token));
  ws.onopen = () => document.getElementById("wsDot").classList.add("ok");
  ws.onclose = () => {
    document.getElementById("wsDot").classList.remove("ok");
    if (token) setTimeout(connectWs, 3000);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "snapshot") {
      msg.devices.forEach(upsertMarker);
      if (msg.devices.length) map.setView([msg.devices[0].lat, msg.devices[0].lng], 15);
    } else if (msg.type === "location") {
      upsertMarker(msg.device);
    } else if (msg.type === "device_removed") {
      removeDevice(msg.device_id);
    } else if (msg.type === "ring") {
      alert("Perangkat dibunyikan oleh " + msg.from_username);
    }
  };
}

async function enterApp() {
  const { user } = await api("/api/auth/me");
  me = user;
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
  document.getElementById("meLabel").textContent = user.username + " (" + user.role + ")";
  document.getElementById("adminBtn").classList.toggle("hidden", user.role !== "admin");
  initMap();
  setTimeout(() => map.invalidateSize(), 100);
  connectWs();
}

document.getElementById("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const err = document.getElementById("loginErr");
  err.textContent = "";
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: document.getElementById("u").value, password: document.getElementById("p").value })
    });
    token = data.token;
    localStorage.setItem(LS_TOKEN, token);
    await enterApp();
  } catch (ex) {
    err.textContent = ex.message;
  }
};

document.getElementById("logoutBtn").onclick = async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  token = "";
  localStorage.removeItem(LS_TOKEN);
  if (ws) ws.close();
  location.reload();
};

document.getElementById("shareBtn").onclick = () => {
  if (!navigator.geolocation) return alert("Browser tidak mendukung GPS");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    await api("/api/location", {
      method: "POST",
      body: JSON.stringify({
        platform: "web",
        device_name: "Browser " + me.username,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      })
    });
  }, (e) => alert("Gagal ambil GPS: " + e.message), { enableHighAccuracy: true });
};

async function loadUsers() {
  const { users } = await api("/api/users");
  document.getElementById("usersList").innerHTML = users.map((u) =>
    '<div class="user-row"><span><strong>' + esc(u.username) + '</strong> (' + esc(u.role) + ')</span>' +
    (u.username === me.username ? "" : '<button class="danger" type="button" onclick="delUser(\\'' + esc(u.username) + '\\')">Hapus</button>') +
    '</div>'
  ).join("");
}

window.delUser = async (u) => {
  if (!confirm("Hapus user " + u + "?")) return;
  await api("/api/users/" + encodeURIComponent(u), { method: "DELETE" });
  await loadUsers();
};

document.getElementById("adminBtn").onclick = async () => {
  document.getElementById("adminModal").classList.remove("hidden");
  await loadUsers();
};
document.getElementById("closeAdmin").onclick = () => {
  document.getElementById("adminModal").classList.add("hidden");
};
document.getElementById("addUserForm").onsubmit = async (e) => {
  e.preventDefault();
  const err = document.getElementById("adminErr");
  err.textContent = "";
  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        username: document.getElementById("newU").value,
        password: document.getElementById("newP").value,
        role: document.getElementById("newR").value
      })
    });
    document.getElementById("newU").value = "";
    document.getElementById("newP").value = "";
    await loadUsers();
  } catch (ex) {
    err.textContent = ex.message;
  }
};

setInterval(renderDevices, 15000);
if (token) enterApp().catch(() => { token = ""; localStorage.removeItem(LS_TOKEN); });
</script>
</body>
</html>`;
