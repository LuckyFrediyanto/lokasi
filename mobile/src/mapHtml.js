import { SERVER_URL } from "./config.js";

export const MAP_HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<style>
  html,body,#map { margin:0; padding:0; width:100%; height:100%; background:#e2e8f0; }
  .user-pin {
    width:36px; height:36px; border-radius:50%; border:3px solid #fff;
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 3px 10px rgba(15,23,42,.35); position:relative;
  }
  .user-pin svg { width:20px; height:20px; fill:#fff; }
  .user-pin .st {
    width:11px; height:11px; border-radius:50%; border:2px solid #fff;
    position:absolute; right:-2px; bottom:-2px; background:#22c55e;
  }
  .user-pin .st.old { background:#94a3b8; }
  .pick-pin {
    background:#f59e0b; color:#0f172a; border:2px solid #fff;
    border-radius:999px; padding:4px 10px; font:700 11px/1.2 -apple-system,sans-serif;
    white-space:nowrap; box-shadow:0 3px 10px rgba(0,0,0,.55);
  }
  .stop-pin {
    background:#14532d; color:#dcfce7; border:2px solid #22c55e;
    border-radius:999px; padding:2px 8px; font:700 11px/1.2 -apple-system,sans-serif;
    white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,.5);
  }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
const map = L.map("map", { zoomControl: true }).setView([-6.8, 110.84], 13);
L.tileLayer("${SERVER_URL}/api/tile/{z}/{x}/{y}.png", {
  maxZoom: 20,
  attribution: "&copy; Maps"
}).addTo(map);
setTimeout(() => map.invalidateSize(), 150);
setTimeout(() => map.invalidateSize(), 700);

const markers = new Map();
let historyLayers = [];
let highlightLayer = null;
let didAutoCenter = false;
let pickActive = false;
let pickMarker = null;
let pickCircle = null;

const USER_SVG = '<svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></svg>';

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function sendMsg(obj) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  }
}

map.on("click", function(e) {
  if (!pickActive) return;
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  updatePickVisual(lat, lng, pickCircle ? pickCircle.getRadius() : 50);
  sendMsg({ type: "picked", lat, lng });
});

function updatePickVisual(lat, lng, radius) {
  if (pickMarker) map.removeLayer(pickMarker);
  if (pickCircle) map.removeLayer(pickCircle);
  const icon = L.divIcon({
    className: "",
    html: '<div class="pick-pin">Pin Lokasi (' + radius + 'm)</div>',
    iconAnchor: [55, 14]
  });
  pickMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
  pickCircle = L.circle([lat, lng], {
    radius: radius,
    color: "#f59e0b",
    fillColor: "#f59e0b",
    fillOpacity: 0.2,
    weight: 2,
    dashArray: "6 4"
  }).addTo(map);
  pickMarker.on("dragend", function(ev) {
    const pos = ev.target.getLatLng();
    pickCircle.setLatLng(pos);
    sendMsg({ type: "picked", lat: pos.lat, lng: pos.lng });
  });
}

window.setPickMode = function(active, lat, lng, radius) {
  pickActive = !!active;
  if (!pickActive) {
    if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
    if (pickCircle) { map.removeLayer(pickCircle); pickCircle = null; }
    return;
  }
  const c = map.getCenter();
  const tLat = typeof lat === "number" ? lat : c.lat;
  const tLng = typeof lng === "number" ? lng : c.lng;
  const rad = typeof radius === "number" ? radius : 50;
  updatePickVisual(tLat, tLng, rad);
  map.setView([tLat, tLng], Math.max(map.getZoom(), 16), { animate: true });
};

window.updateDevices = function(list) {
  const seen = new Set();
  (list || []).forEach((d) => {
    if (d.platform !== "ios" && d.platform !== "android") return;
    seen.add(d.device_id);
    const online = Date.now() - (d.last_seen || d.updated_at) < 90000;
    const col = d.color || "#0284c7";
    const inner = d.photo
      ? '<img src="' + esc(d.photo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="" />'
      : USER_SVG;
    const html = '<div class="user-pin" style="background:' + esc(col) + '">' + inner + '<span class="st ' + (online ? "" : "old") + '"></span></div>';
    const icon = L.divIcon({ className: "", html, iconSize: [36, 36], iconAnchor: [18, 18] });
    if (markers.has(d.device_id)) {
      markers.get(d.device_id).setLatLng([d.lat, d.lng]).setIcon(icon);
    } else {
      const m = L.marker([d.lat, d.lng], { icon }).addTo(map);
      m.on("click", () => sendMsg({ type: "select", device_id: d.device_id }));
      markers.set(d.device_id, m);
    }
  });
  for (const [id, m] of markers.entries()) {
    if (!seen.has(id)) {
      map.removeLayer(m);
      markers.delete(id);
    }
  }
  if (!didAutoCenter && list && list.length) {
    didAutoCenter = true;
    if (list.length === 1) {
      map.setView([list[0].lat, list[0].lng], 16);
    } else {
      map.fitBounds(list.map((d) => [d.lat, d.lng]), { padding: [40, 40] });
    }
  }
};

window.focusDevice = function(lat, lng) {
  map.setView([lat, lng], 17, { animate: true });
};

window.setHistoryRoute = function(points, segments) {
  historyLayers.forEach((l) => map.removeLayer(l));
  historyLayers = [];
  if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }
  if (!points || !points.length) return;
  const latlngs = points.map((p) => [p.lat, p.lng]);
  if (latlngs.length >= 2) {
    const border = L.polyline(latlngs, { color: "#14532d", weight: 9, opacity: 0.75, lineJoin: "round", lineCap: "round" }).addTo(map);
    const greenLine = L.polyline(latlngs, { color: "#22c55e", weight: 5, opacity: 0.98, lineJoin: "round", lineCap: "round" }).addTo(map);
    historyLayers.push(border, greenLine);
  }
  const stays = (segments || []).filter((s) => s.type === "stay");
  stays.forEach((s, idx) => {
    const m = L.marker([s.lat, s.lng], {
      icon: L.divIcon({
        className: "",
        html: '<div class="stop-pin">' + (idx + 1) + '. ' + esc(s.label) + '</div>',
        iconAnchor: [35, 12]
      })
    }).addTo(map);
    historyLayers.push(m);
  });
  if (latlngs.length === 1) {
    map.setView(latlngs[0], 16);
  } else {
    map.fitBounds(latlngs, { padding: [36, 36] });
  }
};

window.highlightSegment = function(lat, lng, tripPoints) {
  if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }
  if (Array.isArray(tripPoints) && tripPoints.length >= 2) {
    highlightLayer = L.polyline(tripPoints, { color: "#86efac", weight: 7, opacity: 1 }).addTo(map);
    map.fitBounds(highlightLayer.getBounds(), { padding: [40, 40] });
  } else if (typeof lat === "number" && typeof lng === "number") {
    map.setView([lat, lng], 17, { animate: true });
  }
};
</script>
</body>
</html>`;
