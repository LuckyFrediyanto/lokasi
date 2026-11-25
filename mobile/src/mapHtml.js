export const MAP_HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#map { margin:0; padding:0; width:100%; height:100%; background:#0f172a; }
  .pin {
    background:#0f172a; color:#fff; border:2px solid #38bdf8;
    border-radius:999px; padding:4px 10px; font:700 12px/1.2 -apple-system,sans-serif;
    white-space:nowrap; box-shadow:0 2px 10px rgba(0,0,0,.5);
    display:inline-flex; align-items:center; gap:5px;
  }
  .pin.ios { border-color:#60a5fa; }
  .pin.android { border-color:#4ade80; }
  .dot { width:8px; height:8px; border-radius:50%; background:#22c55e; }
  .dot.old { background:#94a3b8; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map("map", { zoomControl: true }).setView([-6.8, 110.84], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OSM"
}).addTo(map);

const markers = new Map();
let trail = null;
let didAutoCenter = false;

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

window.updateDevices = function(list) {
  const seen = new Set();
  list.forEach((d) => {
    seen.add(d.device_id);
    const online = Date.now() - d.updated_at < 120000;
    const html = '<div class="pin ' + esc(d.platform) + '"><span class="dot ' + (online ? "" : "old") + '"></span>' +
      esc(d.username) + ' · ' + esc(String(d.platform).toUpperCase()) + '</div>';
    const icon = L.divIcon({ className: "", html, iconAnchor: [45, 14] });
    if (markers.has(d.device_id)) {
      markers.get(d.device_id).setLatLng([d.lat, d.lng]).setIcon(icon);
    } else {
      const m = L.marker([d.lat, d.lng], { icon }).addTo(map);
      m.on("click", () => {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "select", device_id: d.device_id }));
        }
      });
      markers.set(d.device_id, m);
    }
  });
  for (const [id, m] of markers.entries()) {
    if (!seen.has(id)) {
      map.removeLayer(m);
      markers.delete(id);
    }
  }
  if (!didAutoCenter && list.length) {
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

window.setTrail = function(points) {
  if (trail) {
    map.removeLayer(trail);
    trail = null;
  }
  if (!points || !points.length) return;
  trail = L.polyline(points.map((p) => [p.lat, p.lng]), { color: "#38bdf8", weight: 4 }).addTo(map);
  map.fitBounds(trail.getBounds(), { padding: [35, 35] });
};
</script>
</body>
</html>`;
