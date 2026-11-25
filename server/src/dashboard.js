export const DASHBOARD_HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>Lacak HP</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  :root { --bg:#0f172a; --card:#1e293b; --line:#334155; --text:#f8fafc; --muted:#94a3b8; --blue:#38bdf8; --green:#22c55e; --red:#ef4444; }
  * { box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  html,body { margin:0; padding:0; height:100%; background:var(--bg); color:var(--text); overflow:hidden; }
  .hidden { display:none !important; }
  #loginView { height:100%; display:flex; align-items:center; justify-content:center; padding:20px; }
  .box { width:100%; max-width:360px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; }
  h1 { margin:0 0 14px; font-size:21px; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input,select { width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:#0b1220; color:var(--text); font-size:14px; }
  button { cursor:pointer; border:0; border-radius:10px; padding:9px 12px; font-weight:600; font-size:12px; color:#0b1220; background:var(--blue); }
  button.sec { background:#334155; color:var(--text); }
  button.danger { background:var(--red); color:#fff; }
  button.full { width:100%; margin-top:14px; padding:12px; font-size:14px; }
  .err { color:#fca5a5; font-size:12px; margin-top:8px; min-height:16px; }
  #appView { height:100%; display:flex; flex-direction:column; }
  header { height:56px; background:var(--card); border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; padding:0 14px; gap:8px; z-index:500; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:700; font-size:15px; }
  .dot { width:9px; height:9px; border-radius:50%; background:var(--red); display:inline-block; }
  .dot.ok { background:var(--green); }
  .actions { display:flex; gap:6px; align-items:center; }
  main { flex:1; display:flex; position:relative; overflow:hidden; }
  #map { flex:1; height:100%; }
  aside { width:340px; background:var(--card); border-left:1px solid var(--line); overflow:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
  @media (max-width:768px) {
    main { flex-direction:column; }
    aside { width:100%; height:44%; border-left:0; border-top:1px solid var(--line); }
  }
  .dev { background:#0b1220; border:1px solid var(--line); border-radius:12px; padding:10px 12px; }
  .dev-top { display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .dev-name { font-weight:700; font-size:14px; }
  .badge { font-size:11px; padding:2px 7px; border-radius:999px; background:#334155; color:var(--text); }
  .badge.ios { background:#1d4ed8; }
  .badge.android { background:#15803d; }
  .meta { font-size:12px; color:var(--muted); margin-top:4px; line-height:1.4; }
  .dev-btns { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
  .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center; padding:16px; z-index:1000; }
  .modal { width:100%; max-width:440px; max-height:86vh; overflow:auto; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; }
  .user-row { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px; }
  .user-pin { width:34px; height:34px; border-radius:50%; border:3px solid #fff; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,.55); position:relative; }
  .user-pin svg { width:18px; height:18px; fill:#fff; }
  .user-pin .st { width:10px; height:10px; border-radius:50%; border:2px solid #0f172a; position:absolute; right:-2px; bottom:-2px; background:#22c55e; }
  .user-pin .st.off { background:#94a3b8; }
  .color-dot { width:11px; height:11px; border-radius:50%; display:inline-block; margin-right:6px; vertical-align:middle; }
  .toast { position:fixed; top:66px; left:50%; transform:translateX(-50%); background:#0f172a; border:1px solid #38bdf8; color:#fff; padding:10px 14px; border-radius:12px; z-index:900; font-size:13px; font-weight:600; box-shadow:0 6px 24px rgba(0,0,0,.45); }
</style>
</head>
<body>
<div id="loginView">
  <form class="box" id="loginForm">
    <h1>Lacak HP</h1>
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
      <button class="sec" id="notifBtn" type="button">Notifikasi</button>
      <button class="sec hidden" id="adminBtn" type="button">Kelola User</button>
      <button class="danger" id="logoutBtn" type="button">Keluar</button>
    </div>
  </header>
  <main>
    <div id="map"></div>
    <aside id="deviceList"></aside>
  </main>
</div>

<div id="toast" class="toast hidden"></div>

<div id="notifModal" class="modal-bg hidden">
  <div class="modal">
    <div class="dev-top" style="margin-bottom:10px">
      <strong>Notifikasi Lokasi</strong>
      <button class="sec" id="closeNotif" type="button">Tutup</button>
    </div>
    <div id="notifList"></div>
  </div>
</div>

<div id="adminModal" class="modal-bg hidden">
  <div class="modal">
    <div class="dev-top" style="margin-bottom:10px">
      <strong id="adminFormTitle">Tambah User</strong>
      <button class="sec" id="closeAdmin" type="button">Tutup</button>
    </div>
    <form id="userForm">
      <input type="hidden" id="editOriginalU" value="" />
      <label>Username (huruf saja)</label>
      <input id="newU" required placeholder="lucky" />
      <label>Nama (tampil di peta &amp; notifikasi)</label>
      <input id="newN" required placeholder="Lucky Frediyanto" />
      <label id="passLabel">Password (bebas)</label>
      <input id="newP" type="password" placeholder="••••••" />
      <label>Role</label>
      <select id="newR"><option value="user">User</option><option value="admin">Admin</option></select>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="full" style="margin-top:0" type="submit" id="saveUserBtn">Tambah User</button>
        <button class="sec hidden" id="cancelEditBtn" type="button">Batal Edit</button>
      </div>
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
let placeLayers = [];
let devices = new Map();
let places = [];
let notifications = [];
let trailLayer = null;
let historyLayers = [];
let historyState = null;
let trailDeviceId = null;
let toastTimer = null;

function clock(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function durText(m) {
  const mins = Math.max(1, Math.round(m || 1));
  if (mins < 60) return mins + " menit";
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r > 0 ? h + "j " + r + "m" : h + " jam";
}

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

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 6000);
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

function renderPlaces() {
  if (!map) return;
  placeLayers.forEach((l) => map.removeLayer(l));
  placeLayers = [];
}

function upsertMarker(d) {
  if (d.platform !== "ios" && d.platform !== "android") return;
  devices.set(d.device_id, d);
  const online = Date.now() - (d.last_seen || d.updated_at) < 90000;
  const col = d.color || "#38bdf8";
  const tip = (d.display_name || d.username) + " (" + (d.platform === "ios" ? "iOS" : "Android") + ")";
  const svg = '<svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></svg>';
  const icon = L.divIcon({
    className: "",
    html: '<div class="user-pin" title="' + esc(tip) + '" style="background:' + esc(col) + '">' + svg + '<span class="st ' + (online ? "" : "off") + '"></span></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
  if (markers.has(d.device_id)) {
    markers.get(d.device_id).setLatLng([d.lat, d.lng]).setIcon(icon);
  } else {
    markers.set(d.device_id, L.marker([d.lat, d.lng], { icon }).bindTooltip(esc(tip)).addTo(map));
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
  if (historyState) {
    const segs = historyState.data.segments || [];
    const header = '<div class="dev"><div class="dev-top"><span class="dev-name">History · ' + esc(historyState.label) + '</span>' +
      '<button class="sec" type="button" onclick="closeHistory()">Tutup</button></div>' +
      '<div class="meta">Total perjalanan: <strong>' + historyState.data.total_distance_km + ' km</strong></div>' +
      '<div class="dev-btns">' +
      [1, 3, 7].map((d) => '<button type="button" class="' + (historyState.days === d ? "" : "sec") + '" onclick="openHistory(\\'' + esc(historyState.id) + '\\',' + d + ')">' + (d === 1 ? "24 Jam" : d + " Hari") + '</button>').join("") +
      '</div></div>';
    const body = !segs.length
      ? '<div class="meta">Belum ada rekaman perjalanan.</div>'
      : segs.map((s) => s.type === "stay"
        ? '<div class="dev" style="cursor:pointer" onclick="map.setView([' + s.lat + ',' + s.lng + '],17)"><div class="dev-top"><span class="dev-name">' + esc(s.label) + '</span><span class="badge">SINGGAH</span></div><div class="meta">' + clock(s.start_at) + " – " + clock(s.end_at) + " · " + durText(s.duration_min) + '</div></div>'
        : '<div class="dev" style="border-color:#22c55e;background:#0f2419;cursor:pointer" onclick="map.setView([' + s.end_lat + ',' + s.end_lng + '],16)"><div class="dev-top"><span class="dev-name" style="color:#4ade80">Jalan · ' + s.distance_km + ' km</span><span class="badge android">' + durText(s.duration_min) + '</span></div><div class="meta">' + clock(s.start_at) + " – " + clock(s.end_at) + '<br>Dari: ' + esc(s.from_label) + '<br>Ke: ' + esc(s.to_label) + '</div></div>'
      ).join("");
    list.innerHTML = header + body;
    return;
  }
  const arr = Array.from(devices.values()).sort((a, b) => b.updated_at - a.updated_at);
  if (!arr.length) {
    list.innerHTML = '<div class="meta">Belum ada perangkat Android/iOS aktif. Mode Web hanya untuk memantau.</div>';
    return;
  }
  list.innerHTML = arr.map((d) => {
    const online = Date.now() - (d.last_seen || d.updated_at) < 90000;
    const bat = d.battery != null ? Math.round(d.battery) + "%" + (d.charging ? " ⚡" : "") : "-";
    const acc = d.accuracy != null ? Math.round(d.accuracy) + "m" : "-";
    const pLabel = d.platform === "ios" ? "iOS" : "Android";
    const placeTxt = d.current_place ? " · Di " + esc(d.current_place) : "";
    return '<div class="dev">' +
      '<div class="dev-top"><span class="dev-name"><span class="color-dot" style="background:' + esc(d.color || "#38bdf8") + '"></span>' + esc(d.display_name || d.username) + '</span><span class="badge ' + esc(d.platform) + '">' + pLabel + '</span></div>' +
      '<div class="meta">' + esc(d.device_name) + placeTxt + '<br>' +
      (online ? "● Online" : "○ Offline") + " · " + ago(d.updated_at) + " · Baterai " + bat + " · Akurasi " + acc + '</div>' +
      '<div class="dev-btns">' +
      '<button type="button" onclick="focusDev(\\'' + esc(d.device_id) + '\\')">Fokus</button>' +
      '<button class="sec" type="button" onclick="openRoute(' + d.lat + ',' + d.lng + ')">Rute</button>' +
      '<button class="sec" type="button" onclick="pingDev(\\'' + esc(d.device_id) + '\\')">Bunyikan</button>' +
      '<button style="background:#22c55e;color:#0b1220" type="button" onclick="openHistory(\\'' + esc(d.device_id) + '\\',1)">History</button>' +
      '</div></div>';
  }).join("");
}

function renderNotifs() {
  const el = document.getElementById("notifList");
  if (!notifications.length) {
    el.innerHTML = '<div class="meta">Belum ada notifikasi lokasi.</div>';
    return;
  }
  el.innerHTML = notifications.map((n) =>
    '<div class="user-row"><div><div><strong>' + esc(n.message) + '</strong></div><div class="meta">' + ago(n.created_at) + '</div></div></div>'
  ).join("");
}

window.focusDev = (id) => {
  const d = devices.get(id);
  if (d && map) map.setView([d.lat, d.lng], 17);
};
window.openRoute = (lat, lng) => {
  window.open("https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng, "_blank");
};
window.closeHistory = () => {
  historyLayers.forEach((l) => map.removeLayer(l));
  historyLayers = [];
  historyState = null;
  renderDevices();
};
window.openHistory = async (id, days = 1) => {
  historyLayers.forEach((l) => map.removeLayer(l));
  historyLayers = [];
  const d = devices.get(id);
  const data = await api("/api/locations/" + encodeURIComponent(id) + "/history?days=" + days);
  historyState = { id, days, label: d ? (d.display_name || d.username) : id, data };
  const latlngs = (data.points || []).map((p) => [p.lat, p.lng]);
  if (latlngs.length >= 2) {
    historyLayers.push(
      L.polyline(latlngs, { color: "#14532d", weight: 9, opacity: 0.75 }).addTo(map),
      L.polyline(latlngs, { color: "#22c55e", weight: 5, opacity: 0.98 }).addTo(map)
    );
    map.fitBounds(latlngs, { padding: [36, 36] });
  }
  renderDevices();
};
window.pingDev = async (id) => {
  await api("/api/locations/" + encodeURIComponent(id) + "/ping", { method: "POST" });
  showToast("Sinyal bunyikan dikirim");
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
      for (const id of Array.from(devices.keys())) removeDevice(id);
      (msg.devices || []).forEach(upsertMarker);
      if (Array.isArray(msg.places)) { places = msg.places; renderPlaces(); }
      if (Array.isArray(msg.notifications)) { notifications = msg.notifications; renderNotifs(); }
      if (msg.devices && msg.devices.length) map.setView([msg.devices[0].lat, msg.devices[0].lng], 15);
    } else if (msg.type === "location") {
      upsertMarker(msg.device);
    } else if (msg.type === "device_removed") {
      removeDevice(msg.device_id);
    } else if (msg.type === "places") {
      places = msg.places || [];
      renderPlaces();
    } else if (msg.type === "notification" && msg.notification) {
      notifications.unshift(msg.notification);
      notifications = notifications.slice(0, 50);
      renderNotifs();
      showToast(msg.notification.message);
    }
  };
}

async function enterApp() {
  const { user } = await api("/api/auth/me");
  me = user;
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
  document.getElementById("meLabel").textContent = (user.display_name || user.username) + " (Pantau Web)";
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
      body: JSON.stringify({ username: document.getElementById("u").value, password: document.getElementById("p").value, client_type: "web" })
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

document.getElementById("notifBtn").onclick = () => {
  renderNotifs();
  document.getElementById("notifModal").classList.remove("hidden");
};
document.getElementById("closeNotif").onclick = () => {
  document.getElementById("notifModal").classList.add("hidden");
};

function resetUserForm() {
  document.getElementById("editOriginalU").value = "";
  document.getElementById("newU").value = "";
  document.getElementById("newN").value = "";
  document.getElementById("newP").value = "";
  document.getElementById("newR").value = "user";
  document.getElementById("adminFormTitle").textContent = "Tambah User";
  document.getElementById("passLabel").textContent = "Password (bebas)";
  document.getElementById("saveUserBtn").textContent = "Tambah User";
  document.getElementById("cancelEditBtn").classList.add("hidden");
  document.getElementById("adminErr").textContent = "";
}

async function loadUsers() {
  const { users } = await api("/api/users");
  document.getElementById("usersList").innerHTML = users.map((u) =>
    '<div class="user-row"><div><span class="color-dot" style="background:' + esc(u.color || "#38bdf8") + '"></span><strong>' + esc(u.display_name || u.username) + '</strong> <span class="meta">(@' + esc(u.username) + ' · ' + esc(u.role) + (u.logged_in ? ' · aktif' : '') + ')</span></div>' +
    '<div style="display:flex;gap:5px"><button class="sec" type="button" onclick="editUser(\\'' + esc(u.username) + '\\',\\'' + esc(u.display_name || u.username) + '\\',\\'' + esc(u.role) + '\\')">Edit</button>' +
    '<button class="sec" type="button" onclick="logoutUser(\\'' + esc(u.username) + '\\')">Logout</button>' +
    (u.username === me.username ? "" : '<button class="danger" type="button" onclick="delUser(\\'' + esc(u.username) + '\\')">Hapus</button>') +
    '</div></div>'
  ).join("");
}

window.logoutUser = async (u) => {
  if (!confirm("Logout paksa user @" + u + "?")) return;
  await api("/api/users/" + encodeURIComponent(u) + "/logout", { method: "POST" });
  showToast("User @" + u + " telah di-logout");
  await loadUsers();
};

window.editUser = (u, n, r) => {
  document.getElementById("editOriginalU").value = u;
  document.getElementById("newU").value = u;
  document.getElementById("newN").value = n;
  document.getElementById("newP").value = "";
  document.getElementById("newR").value = r;
  document.getElementById("adminFormTitle").textContent = "Edit User @" + u;
  document.getElementById("passLabel").textContent = "Password baru (kosongkan jika tidak diubah)";
  document.getElementById("saveUserBtn").textContent = "Simpan Perubahan";
  document.getElementById("cancelEditBtn").classList.remove("hidden");
};

window.delUser = async (u) => {
  if (!confirm("Hapus user @" + u + "?")) return;
  await api("/api/users/" + encodeURIComponent(u), { method: "DELETE" });
  await loadUsers();
};

document.getElementById("adminBtn").onclick = async () => {
  resetUserForm();
  document.getElementById("adminModal").classList.remove("hidden");
  await loadUsers();
};
document.getElementById("closeAdmin").onclick = () => document.getElementById("adminModal").classList.add("hidden");
document.getElementById("cancelEditBtn").onclick = resetUserForm;

document.getElementById("newU").oninput = (e) => {
  e.target.value = e.target.value.toLowerCase().replace(/[^a-z]/g, "");
};

document.getElementById("userForm").onsubmit = async (e) => {
  e.preventDefault();
  const err = document.getElementById("adminErr");
  err.textContent = "";
  const orig = document.getElementById("editOriginalU").value;
  const payload = {
    username: document.getElementById("newU").value,
    display_name: document.getElementById("newN").value,
    password: document.getElementById("newP").value,
    role: document.getElementById("newR").value
  };
  try {
    if (orig) {
      const res = await api("/api/users/" + encodeURIComponent(orig), { method: "PATCH", body: JSON.stringify(payload) });
      if (orig === me.username) {
        me = res.user;
        document.getElementById("meLabel").textContent = (me.display_name || me.username) + " (Pantau Web)";
      }
    } else {
      await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
    }
    resetUserForm();
    await loadUsers();
  } catch (ex) {
    err.textContent = ex.message;
  }
};

setInterval(renderDevices, 10000);
if (token) enterApp().catch(() => { token = ""; localStorage.removeItem(LS_TOKEN); });
</script>
</body>
</html>`;
