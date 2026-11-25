export const DASHBOARD_HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>Lacak HP</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<style>
  :root { --bg:#f8fafc; --card:#ffffff; --line:#e2e8f0; --text:#0f172a; --muted:#64748b; --blue:#0284c7; --green:#16a34a; --red:#dc2626; --soft:#f1f5f9; }
  * { box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  html,body { margin:0; padding:0; height:100%; background:var(--bg); color:var(--text); overflow:hidden; }
  .hidden { display:none !important; }
  #loginView { height:100%; display:flex; align-items:center; justify-content:center; padding:20px; background:var(--bg); }
  .box { width:100%; max-width:360px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; box-shadow:0 8px 24px rgba(15,23,42,.08); }
  h1 { margin:0 0 14px; font-size:21px; color:var(--text); }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; font-weight:600; }
  input,select { width:100%; padding:10px 12px; border-radius:10px; border:1px solid #cbd5e1; background:#fff; color:var(--text); font-size:14px; }
  button { cursor:pointer; border:0; border-radius:10px; padding:8px 12px; font-weight:600; font-size:12px; color:#fff; background:var(--blue); }
  button.sec { background:var(--soft); color:var(--text); border:1px solid var(--line); }
  button.danger { background:var(--red); color:#fff; }
  button.green { background:var(--green); color:#fff; }
  button.full { width:100%; margin-top:14px; padding:12px; font-size:14px; }
  .icon-btn { width:38px; height:38px; padding:0; border-radius:10px; background:var(--soft); color:var(--text); border:1px solid var(--line); display:inline-flex; align-items:center; justify-content:center; position:relative; }
  .icon-btn.active { background:#e0f2fe; border-color:#38bdf8; color:#0284c7; }
  .icon-btn.danger-icon { background:#fee2e2; border-color:#fecaca; color:#dc2626; }
  .icon-btn svg { width:19px; height:19px; fill:currentColor; }
  .notif-badge { position:absolute; top:-4px; right:-4px; min-width:17px; height:17px; padding:0 4px; border-radius:999px; background:#dc2626; color:#fff; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; }
  .err { color:var(--red); font-size:12px; margin-top:8px; min-height:16px; }
  #appView { height:100%; display:flex; flex-direction:column; }
  header { height:56px; background:var(--card); border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; padding:0 14px; gap:8px; z-index:500; box-shadow:0 1px 4px rgba(15,23,42,.05); }
  .brand { display:flex; align-items:center; gap:8px; font-weight:700; font-size:15px; }
  .dot { width:9px; height:9px; border-radius:50%; background:var(--red); display:inline-block; }
  .dot.ok { background:var(--green); }
  .actions { display:flex; gap:8px; align-items:center; }
  main { flex:1; display:flex; position:relative; overflow:hidden; }
  .map-wrap { flex:1; height:100%; position:relative; }
  #map { width:100%; height:100%; }
  .my-loc-btn { position:absolute; right:14px; bottom:18px; z-index:450; width:44px; height:44px; border-radius:50%; background:#fff; color:#0f172a; border:1px solid #cbd5e1; box-shadow:0 3px 12px rgba(15,23,42,.22); display:flex; align-items:center; justify-content:center; padding:0; }
  .my-loc-btn svg { width:22px; height:22px; fill:#0284c7; }
  aside { width:360px; background:var(--bg); border-left:1px solid var(--line); overflow:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
  @media (max-width:768px) {
    main { flex-direction:column; }
    aside { width:100%; height:44%; border-left:0; border-top:1px solid var(--line); }
  }
  .dev { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:11px 12px; box-shadow:0 1px 3px rgba(15,23,42,.04); }
  .dev-top { display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .dev-name { font-weight:700; font-size:14px; color:var(--text); }
  .badge { font-size:11px; padding:2px 8px; border-radius:999px; background:#e2e8f0; color:#334155; font-weight:700; }
  .badge.ios { background:#dbeafe; color:#1d4ed8; }
  .badge.android { background:#dcfce7; color:#15803d; }
  .meta { font-size:12px; color:var(--muted); margin-top:4px; line-height:1.4; }
  .dev-btns { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
  .modal-bg { position:fixed; inset:0; background:rgba(15,23,42,.45); display:flex; align-items:center; justify-content:center; padding:16px; z-index:1000; }
  .modal { width:100%; max-width:440px; max-height:86vh; overflow:auto; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; box-shadow:0 16px 40px rgba(15,23,42,.2); }
  .user-row { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px; }
  .user-pin { width:36px; height:36px; border-radius:50%; border:3px solid #fff; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(15,23,42,.35); position:relative; box-sizing:border-box; }
  .user-pin svg { width:18px; height:18px; fill:#fff; }
  .user-pin img { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
  .user-pin .st { width:10px; height:10px; border-radius:50%; border:2px solid #fff; position:absolute; right:-2px; bottom:-2px; background:#22c55e; }
  .user-pin .st.off { background:#94a3b8; }
  .cluster-pill { display:inline-flex; align-items:center; gap:3px; padding:3px; background:#fff; border:2.5px solid #fff; border-radius:999px; box-shadow:0 4px 14px rgba(15,23,42,.36); box-sizing:border-box; }
  .cluster-av { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; position:relative; flex-shrink:0; }
  .cluster-av svg { width:17px; height:17px; fill:#fff; }
  .cluster-av img { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
  .cluster-av .st { width:9px; height:9px; border-radius:50%; border:1.5px solid #fff; position:absolute; right:-1px; bottom:-1px; background:#22c55e; }
  .cluster-av .st.off { background:#94a3b8; }
  .color-dot { width:11px; height:11px; border-radius:50%; display:inline-block; margin-right:6px; vertical-align:middle; }
  .toast { position:fixed; top:66px; left:50%; transform:translateX(-50%); background:#0f172a; color:#fff; padding:10px 14px; border-radius:12px; z-index:900; font-size:13px; font-weight:600; box-shadow:0 6px 24px rgba(15,23,42,.25); }
  .notif-card { display:flex; gap:10px; align-items:center; cursor:pointer; }
  .mini-map { width:64px; height:64px; border-radius:10px; overflow:hidden; position:relative; flex-shrink:0; border:1px solid var(--line); background:#e2e8f0; }
  .mini-map img { width:100%; height:100%; object-fit:cover; display:block; }
  .mini-pin { width:12px; height:12px; border-radius:50%; border:2px solid #fff; position:absolute; transform:translate(-50%,-50%); box-shadow:0 1px 4px rgba(0,0,0,.45); }
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
      <button class="icon-btn" id="notifBtn" type="button" title="Notifikasi">
        <svg viewBox="0 0 24 24"><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
        <span class="notif-badge hidden" id="notifBadge">0</span>
      </button>
      <button class="icon-btn hidden" id="adminBtn" type="button" title="Kelola User">
        <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
      </button>
      <button class="icon-btn danger-icon" id="logoutBtn" type="button" title="Keluar">
        <svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
      </button>
    </div>
  </header>
  <main>
    <div class="map-wrap">
      <div id="map"></div>
      <button class="my-loc-btn" id="myLocBtn" type="button" title="Lokasi Saat Ini">
        <svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
      </button>
    </div>
    <aside id="deviceList"></aside>
  </main>
</div>

<div id="toast" class="toast hidden"></div>

<div id="logoutModal" class="modal-bg hidden">
  <div class="modal" style="max-width:340px;text-align:center">
    <div style="width:48px;height:48px;border-radius:50%;background:#fee2e2;color:#dc2626;display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px">
      <svg style="width:24px;height:24px;fill:currentColor" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
    </div>
    <div style="font-size:17px;font-weight:700;margin-bottom:6px">Konfirmasi Keluar</div>
    <div class="meta" style="margin-bottom:12px">Masukkan password akun Anda untuk keluar.</div>
    <input id="logoutPass" type="password" placeholder="Password akun" style="margin-bottom:6px" />
    <div class="err" id="logoutErr" style="margin-bottom:10px"></div>
    <div style="display:flex;gap:8px">
      <button class="sec" style="flex:1;padding:10px" id="cancelLogoutBtn" type="button">Batal</button>
      <button class="danger" style="flex:1;padding:10px" id="confirmLogoutBtn" type="button">Ya, Keluar</button>
    </div>
  </div>
</div>

<div id="adminView" class="hidden" style="height:100%;display:flex;flex-direction:column;background:var(--bg)">
  <header>
    <div class="brand">
      <button class="icon-btn" id="closeAdmin" type="button" title="Kembali">
        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      <span id="adminFormTitle">Kelola User</span>
    </div>
  </header>
  <div style="flex:1;overflow:auto;padding:16px;max-width:640px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:14px">
    <form class="dev" id="userForm" style="padding:16px">
      <input type="hidden" id="editOriginalU" value="" />
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">
        <img id="formAvatarPreview" src="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #0284c7;display:none" alt="" />
        <div id="formAvatarPlaceholder" style="width:56px;height:56px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#64748b">
          <svg style="width:28px;height:28px;fill:currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></svg>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <input type="file" id="photoFileInput" accept="image/*" style="display:none" />
          <button class="sec" type="button" id="uploadPhotoBtn">Upload Foto</button>
          <button class="danger hidden" type="button" id="deletePhotoBtn">Hapus Foto</button>
        </div>
      </div>
      <label style="margin-top:0">Username (huruf saja)</label>
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
    <div class="dev" style="padding:14px">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px">Daftar User</div>
      <div id="usersList"></div>
    </div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
const LS_TOKEN = "lacak_token";
let token = localStorage.getItem(LS_TOKEN) || "";
let me = null;
let ws = null;
let map = null;
let markers = new Map();
let devices = new Map();
let notifications = [];
let unreadNotifs = 0;
let panelMode = "devices";
let historyLayers = [];
let historyState = null;
let currentFormPhoto = null;
let ringingTimers = new Map();
let toastTimer = null;

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

function osmTile(lat, lng, z = 16) {
  const n = Math.pow(2, z);
  const xf = ((lng + 180) / 360) * n;
  const lr = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
  return {
    url: "/api/tile/" + z + "/" + Math.floor(xf) + "/" + Math.floor(yf) + ".png",
    px: Math.max(12, Math.min(88, (xf - Math.floor(xf)) * 100)),
    py: Math.max(12, Math.min(88, (yf - Math.floor(yf)) * 100))
  };
}

function updateNotifBadge() {
  const el = document.getElementById("notifBadge");
  if (unreadNotifs > 0) {
    el.textContent = String(unreadNotifs);
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
  document.getElementById("notifBtn").classList.toggle("active", panelMode === "notifs");
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
  map = L.map("map").setView([-6.8, 110.84], 13);
  L.tileLayer("/api/tile/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; Maps"
  }).addTo(map);
  map.on("zoomend", renderMarkers);
}

let clusterMarkers = [];
function renderMarkers() {
  if (!map) return;
  clusterMarkers.forEach((m) => map.removeLayer(m));
  clusterMarkers = [];
  const list = Array.from(devices.values()).filter((d) => d.platform === "ios" || d.platform === "android");
  if (!list.length) return;
  const svg = '<svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></svg>';
  const zoom = map.getZoom();
  const groups = [];
  for (const d of list) {
    const pt = map.project([d.lat, d.lng], zoom);
    let grp = null;
    for (const g of groups) {
      if (Math.hypot(pt.x - g.cx, pt.y - g.cy) <= 42) { grp = g; break; }
    }
    if (grp) {
      grp.items.push(d);
      const n = grp.items.length;
      grp.cx = (grp.cx * (n - 1) + pt.x) / n;
      grp.cy = (grp.cy * (n - 1) + pt.y) / n;
    } else {
      groups.push({ cx: pt.x, cy: pt.y, items: [d] });
    }
  }
  for (const g of groups) {
    const avgLat = g.items.reduce((s, d) => s + d.lat, 0) / g.items.length;
    const avgLng = g.items.reduce((s, d) => s + d.lng, 0) / g.items.length;
    if (g.items.length === 1) {
      const d = g.items[0];
      const online = Date.now() - (d.last_seen || d.updated_at) < 90000;
      const col = d.color || "#0284c7";
      const tip = (d.display_name || d.username) + " (" + (d.platform === "ios" ? "iOS" : "Android") + ")";
      const inner = d.photo ? '<img src="' + esc(d.photo) + '" alt="" />' : svg;
      const icon = L.divIcon({
        className: "",
        html: '<div class="user-pin" style="background:' + esc(col) + '">' + inner + '<span class="st ' + (online ? "" : "off") + '"></span></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      clusterMarkers.push(L.marker([d.lat, d.lng], { icon }).bindTooltip(esc(tip)).addTo(map));
    } else {
      const itemsHtml = g.items.map((d) => {
        const online = Date.now() - (d.last_seen || d.updated_at) < 90000;
        const col = d.color || "#0284c7";
        const inner = d.photo ? '<img src="' + esc(d.photo) + '" alt="" />' : svg;
        return '<div class="cluster-av" style="background:' + esc(col) + '">' + inner + '<span class="st ' + (online ? "" : "off") + '"></span></div>';
      }).join("");
      const width = g.items.length * 32 + (g.items.length - 1) * 3 + 11;
      const tip = g.items.map((d) => d.display_name || d.username).join(", ");
      const icon = L.divIcon({
        className: "",
        html: '<div class="cluster-pill">' + itemsHtml + '</div>',
        iconSize: [width, 43],
        iconAnchor: [width / 2, 21]
      });
      const m = L.marker([avgLat, avgLng], { icon }).bindTooltip(esc(tip)).addTo(map);
      m.on("click", () => {
        const bounds = L.latLngBounds(g.items.map((d) => [d.lat, d.lng]));
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) map.setView([avgLat, avgLng], Math.min(20, map.getZoom() + 2));
        else map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
      });
      clusterMarkers.push(m);
    }
  }
}

function upsertMarker(d) {
  if (d.platform !== "ios" && d.platform !== "android") return;
  devices.set(d.device_id, d);
  renderMarkers();
  renderPanel();
}

function removeDevice(deviceId) {
  devices.delete(deviceId);
  renderMarkers();
  renderPanel();
}

function renderPanel() {
  const list = document.getElementById("deviceList");
  updateNotifBadge();

  if (panelMode === "history" && historyState) {
    const segs = historyState.data.segments || [];
    const header = '<div class="dev"><div class="dev-top"><span class="dev-name">History · ' + esc(historyState.label) + '</span>' +
      '<button class="sec" type="button" onclick="closeHistory()">Tutup</button></div>' +
      '<div class="meta">Total perjalanan: <strong>' + historyState.data.total_distance_km + ' km</strong></div>' +
      '<div class="dev-btns">' +
      [1, 3, 7].map((d) => '<button type="button" class="' + (historyState.days === d ? "green" : "sec") + '" onclick="openHistory(\\'' + esc(historyState.id) + '\\',' + d + ',\\'' + esc(historyState.label) + '\\')">' + (d === 1 ? "24 Jam" : d + " Hari") + '</button>').join("") +
      '</div></div>';
    const body = !segs.length
      ? '<div class="meta">Belum ada rekaman perjalanan.</div>'
      : segs.map((s) => s.type === "stay"
        ? '<div class="dev" style="cursor:pointer" onclick="map.setView([' + s.lat + ',' + s.lng + '],17)"><div class="dev-top"><span class="dev-name">' + esc(s.label) + '</span><span class="badge">SINGGAH</span></div><div class="meta">' + clock(s.start_at) + " – " + clock(s.end_at) + " · " + durText(s.duration_min) + '</div></div>'
        : '<div class="dev" style="border-color:#22c55e;background:#f0fdf4;cursor:pointer" onclick="map.setView([' + s.end_lat + ',' + s.end_lng + '],16)"><div class="dev-top"><span class="dev-name" style="color:#15803d">Jalan · ' + s.distance_km + ' km</span><span class="badge android">' + durText(s.duration_min) + '</span></div><div class="meta">' + clock(s.start_at) + " – " + clock(s.end_at) + '<br>Dari: ' + esc(s.from_label) + '<br>Ke: ' + esc(s.to_label) + '</div></div>'
      ).join("");
    list.innerHTML = header + body;
    return;
  }

  if (panelMode === "notifs") {
    const header = '<div class="dev"><div class="dev-top"><span class="dev-name">Notifikasi Lokasi</span><button class="sec" type="button" onclick="closeNotifs()">Tutup</button></div><div class="meta">Ketuk notifikasi untuk melihat rute perjalanan user.</div></div>';
    const body = !notifications.length
      ? '<div class="meta">Belum ada notifikasi pergi/sampai.</div>'
      : notifications.map((n) => {
          const hasCoord = typeof n.lat === "number" && typeof n.lng === "number";
          const tile = hasCoord ? osmTile(n.lat, n.lng, 16) : null;
          const preview = tile
            ? '<div class="mini-map"><img src="' + tile.url + '" alt="" /><span class="mini-pin" style="left:' + tile.px + '%;top:' + tile.py + '%;background:' + esc(n.color || "#0284c7") + '"></span></div>'
            : '<div class="mini-map"></div>';
          return '<div class="dev notif-card" onclick="openHistory(\\'' + esc(n.device_id) + '\\',1,\\'' + esc(n.display_name || n.username) + '\\')">' +
            preview +
            '<div><div class="dev-name">' + esc(n.message) + '</div><div class="meta">' + ago(n.created_at) + ' · Lihat rute →</div></div></div>';
        }).join("");
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
    const isRinging = ringingTimers.has(d.device_id);
    const avatar = d.photo
      ? '<img src="' + esc(d.photo) + '" style="width:20px;height:20px;border-radius:50%;object-fit:cover;margin-right:6px;vertical-align:middle;border:1px solid ' + esc(d.color || '#0284c7') + '" alt="" />'
      : '<span class="color-dot" style="background:' + esc(d.color || "#0284c7") + '"></span>';
    return '<div class="dev">' +
      '<div class="dev-top"><span class="dev-name">' + avatar + esc(d.display_name || d.username) + '</span><span class="badge ' + esc(d.platform) + '">' + pLabel + '</span></div>' +
      '<div class="meta">' + esc(d.device_name) + placeTxt + '<br>' +
      (online ? "● Online" : "○ Offline") + " · " + ago(d.updated_at) + " · Baterai " + bat + " · Akurasi " + acc + '</div>' +
      '<div class="dev-btns">' +
      '<button type="button" onclick="focusDev(\\'' + esc(d.device_id) + '\\')">Fokus</button>' +
      '<button class="sec" type="button" onclick="openRoute(' + d.lat + ',' + d.lng + ')">Rute</button>' +
      (isRinging
        ? '<button class="danger" type="button" onclick="stopPingDev(\\'' + esc(d.device_id) + '\\')">Hentikan</button>'
        : '<button class="sec" type="button" onclick="pingDev(\\'' + esc(d.device_id) + '\\')">Bunyikan</button>') +
      '<button class="green" type="button" onclick="openHistory(\\'' + esc(d.device_id) + '\\',1,\\'' + esc(d.display_name || d.username) + '\\')">History</button>' +
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
window.closeNotifs = () => {
  panelMode = "devices";
  renderPanel();
};
window.closeHistory = () => {
  historyLayers.forEach((l) => map.removeLayer(l));
  historyLayers = [];
  historyState = null;
  panelMode = "devices";
  renderPanel();
};
window.openHistory = async (id, days = 1, label = "") => {
  historyLayers.forEach((l) => map.removeLayer(l));
  historyLayers = [];
  const d = devices.get(id);
  const data = await api("/api/locations/" + encodeURIComponent(id) + "/history?days=" + days);
  historyState = { id, days, label: label || (d ? (d.display_name || d.username) : id), data };
  panelMode = "history";
  const latlngs = (data.points || []).map((p) => [p.lat, p.lng]);
  if (latlngs.length >= 2) {
    historyLayers.push(
      L.polyline(latlngs, { color: "#14532d", weight: 9, opacity: 0.75 }).addTo(map),
      L.polyline(latlngs, { color: "#22c55e", weight: 5, opacity: 0.98 }).addTo(map)
    );
    map.fitBounds(latlngs, { padding: [36, 36] });
  }
  renderPanel();
};
window.pingDev = async (id) => {
  await api("/api/locations/" + encodeURIComponent(id) + "/ping", { method: "POST" });
  if (ringingTimers.has(id)) clearTimeout(ringingTimers.get(id));
  ringingTimers.set(id, setTimeout(() => { ringingTimers.delete(id); renderPanel(); }, 30000));
  showToast("HP sedang dibunyikan (maks 30 detik)");
  renderPanel();
};
window.stopPingDev = async (id) => {
  await api("/api/locations/" + encodeURIComponent(id) + "/stop-ping", { method: "POST" });
  if (ringingTimers.has(id)) { clearTimeout(ringingTimers.get(id)); ringingTimers.delete(id); }
  showToast("Suara & getaran dihentikan");
  renderPanel();
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
      if (Array.isArray(msg.notifications)) notifications = msg.notifications;
      if (msg.devices && msg.devices.length) map.setView([msg.devices[0].lat, msg.devices[0].lng], 15);
      renderPanel();
    } else if (msg.type === "location") {
      upsertMarker(msg.device);
    } else if (msg.type === "device_removed") {
      removeDevice(msg.device_id);
    } else if (msg.type === "notification" && msg.notification) {
      notifications.unshift(msg.notification);
      notifications = notifications.slice(0, 50);
      if (panelMode !== "notifs") unreadNotifs += 1;
      showToast(msg.notification.message);
      renderPanel();
    } else if (msg.type === "stop_ring" && msg.target_device_id) {
      if (ringingTimers.has(msg.target_device_id)) {
        clearTimeout(ringingTimers.get(msg.target_device_id));
        ringingTimers.delete(msg.target_device_id);
        renderPanel();
      }
    }
  };
}

async function enterApp() {
  const { user } = await api("/api/auth/me");
  me = user;
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
  document.getElementById("meLabel").textContent = user.display_name || user.username;
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

document.getElementById("logoutBtn").onclick = () => {
  document.getElementById("logoutPass").value = "";
  document.getElementById("logoutErr").textContent = "";
  document.getElementById("logoutModal").classList.remove("hidden");
};
document.getElementById("cancelLogoutBtn").onclick = () => {
  document.getElementById("logoutModal").classList.add("hidden");
};
document.getElementById("confirmLogoutBtn").onclick = async () => {
  const errEl = document.getElementById("logoutErr");
  const pw = document.getElementById("logoutPass").value;
  errEl.textContent = "";
  if (!pw) {
    errEl.textContent = "Password wajib diisi";
    return;
  }
  try {
    await api("/api/auth/logout", { method: "POST", body: JSON.stringify({ password: pw, require_password: true }) });
    document.getElementById("logoutModal").classList.add("hidden");
    token = "";
    localStorage.removeItem(LS_TOKEN);
    if (ws) ws.close();
    location.reload();
  } catch (ex) {
    errEl.textContent = ex.message || "Password salah";
  }
};

document.getElementById("notifBtn").onclick = () => {
  if (panelMode === "notifs") {
    panelMode = "devices";
  } else {
    panelMode = "notifs";
    unreadNotifs = 0;
  }
  renderPanel();
};

document.getElementById("myLocBtn").onclick = () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map && map.setView([pos.coords.latitude, pos.coords.longitude], 17),
      () => {
        const first = Array.from(devices.values())[0];
        if (first && map) map.setView([first.lat, first.lng], 17);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }
};

function setFormPhotoState(base64) {
  currentFormPhoto = base64;
  const img = document.getElementById("formAvatarPreview");
  const ph = document.getElementById("formAvatarPlaceholder");
  const delBtn = document.getElementById("deletePhotoBtn");
  const upBtn = document.getElementById("uploadPhotoBtn");
  if (base64) {
    img.src = base64;
    img.style.display = "block";
    ph.style.display = "none";
    delBtn.classList.remove("hidden");
    upBtn.textContent = "Ganti Foto";
  } else {
    img.src = "";
    img.style.display = "none";
    ph.style.display = "flex";
    delBtn.classList.add("hidden");
    upBtn.textContent = "Upload Foto";
  }
}

function resetUserForm() {
  document.getElementById("editOriginalU").value = "";
  document.getElementById("newU").value = "";
  document.getElementById("newN").value = "";
  document.getElementById("newP").value = "";
  document.getElementById("newR").value = "user";
  setFormPhotoState(null);
  document.getElementById("adminFormTitle").textContent = "Tambah User";
  document.getElementById("passLabel").textContent = "Password (bebas)";
  document.getElementById("saveUserBtn").textContent = "Tambah User";
  document.getElementById("cancelEditBtn").classList.add("hidden");
  document.getElementById("adminErr").textContent = "";
}

async function loadUsers() {
  const users = (await api("/api/users")).users || [];
  document.getElementById("usersList").innerHTML = users.map((u) => {
    const avatar = u.photo
      ? '<img src="' + esc(u.photo) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;margin-right:8px;vertical-align:middle;border:1.5px solid ' + esc(u.color || '#0284c7') + '" alt="" />'
      : '<span class="color-dot" style="background:' + esc(u.color || "#0284c7") + ';width:14px;height:14px"></span>';
    const jsonU = esc(JSON.stringify(u));
    return '<div class="user-row"><div style="display:flex;align-items:center">' + avatar +
      '<div><strong>' + esc(u.display_name || u.username) + '</strong> <span class="meta">(@' + esc(u.username) + ' · ' + esc(u.role) + (u.logged_in ? ' · aktif' : '') + ')</span></div></div>' +
      '<div style="display:flex;gap:5px"><button class="sec" type="button" data-user="' + jsonU + '" onclick="startEditUserObj(this)">Edit</button>' +
      '<button class="sec" type="button" onclick="logoutUser(\\'' + esc(u.username) + '\\')">Logout</button>' +
      (u.username === me.username ? "" : '<button class="danger" type="button" onclick="delUser(\\'' + esc(u.username) + '\\')">Hapus</button>') +
      '</div></div>';
  }).join("");
}

window.startEditUserObj = (btn) => {
  try {
    const u = JSON.parse(btn.getAttribute("data-user"));
    document.getElementById("editOriginalU").value = u.username;
    document.getElementById("newU").value = u.username;
    document.getElementById("newN").value = u.display_name || u.username;
    document.getElementById("newP").value = "";
    document.getElementById("newR").value = u.role;
    setFormPhotoState(u.photo || null);
    document.getElementById("adminFormTitle").textContent = "Edit User @" + u.username;
    document.getElementById("passLabel").textContent = "Password baru (kosongkan jika tidak diubah)";
    document.getElementById("saveUserBtn").textContent = "Simpan Perubahan";
    document.getElementById("cancelEditBtn").classList.remove("hidden");
  } catch {}
};

document.getElementById("uploadPhotoBtn").onclick = () => {
  document.getElementById("photoFileInput").click();
};
document.getElementById("deletePhotoBtn").onclick = () => {
  setFormPhotoState(null);
};
document.getElementById("photoFileInput").onchange = (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 160, 160);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      setFormPhotoState(dataUrl);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

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
  document.getElementById("appView").classList.add("hidden");
  document.getElementById("adminView").classList.remove("hidden");
  await loadUsers();
};
document.getElementById("closeAdmin").onclick = () => {
  document.getElementById("adminView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
  if (map) setTimeout(() => map.invalidateSize(), 100);
};
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
    photo: currentFormPhoto,
    role: document.getElementById("newR").value
  };
  try {
    if (orig) {
      const res = await api("/api/users/" + encodeURIComponent(orig), { method: "PATCH", body: JSON.stringify(payload) });
      if (orig === me.username) {
        me = res.user;
        document.getElementById("meLabel").textContent = me.display_name || me.username;
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

setInterval(renderPanel, 10000);
if (token) enterApp().catch(() => { token = ""; localStorage.removeItem(LS_TOKEN); });
</script>
</body>
</html>`;
