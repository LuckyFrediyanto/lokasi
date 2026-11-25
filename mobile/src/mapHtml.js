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
  .place-tag {
    background:rgba(15,23,42,.92); color:#7dd3fc; border:1px solid #38bdf8;
    border-radius:8px; padding:2px 7px; font:700 11px/1.2 -apple-system,sans-serif;
    white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,.45);
  }
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
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map("map", { zoomControl: true }).setView([-6.8, 110.84], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OSM"
}).addTo(map);

const markers = new Map();
let placeLayers = [];
let historyLayers = [];
let highlightLayer = null;
let didAutoCenter = false;
let pickActive = false;
let pickMarker = null;
let pickCircle = null;

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

window.updatePlaces = function(list) {
  placeLayers.forEach((l) => map.removeLayer(l));
  placeLayers = [];
  (list || []).forEach((p) => {
    const circle = L.circle([p.lat, p.lng], {
      radius: p.radius,
      color: "#38bdf8",
      fillColor: "#38bdf8",
      fillOpacity: 0.14,
      weight: 2
    }).addTo(map);
    const label = L.marker([p.lat, p.lng], {
      interactive: false,
      icon: L.divIcon({
        className: "",
        html: '<div class="place-tag">' + esc(p.name) + ' · ' + p.radius + 'm</div>',
        iconAnchor: [35, 12]
      })
    }).addTo(map);
    placeLayers.push(circle, label);
  });
};

window.updateDevices = function(list) {
  const seen = new Set();
  (list || []).forEach((d) => {
    if (d.platform !== "ios" && d.platform !== "android") return;
    seen.add(d.device_id);
    const online = Date.now() - (d.last_seen || d.updated_at) < 90000;
    const label = (d.display_name || d.username) + " · " + (d.platform === "ios" ? "iOS" : "Android");
    const html = '<div class="pin ' + esc(d.platform) + '"><span class="dot ' + (online ? "" : "old") + '"></span>' + esc(label) + '</div>';
    const icon = L.divIcon({ className: "", html, iconAnchor: [55, 14] });
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
