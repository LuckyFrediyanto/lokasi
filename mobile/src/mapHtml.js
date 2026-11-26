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
    width:38px; height:38px; border-radius:50%; border:3px solid #fff;
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 3px 10px rgba(15,23,42,.38); position:relative;
    box-sizing:border-box;
  }
  .user-pin svg { width:20px; height:20px; fill:#fff; }
  .user-pin img { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
  .user-pin .st {
    width:11px; height:11px; border-radius:50%; border:2px solid #fff;
    position:absolute; right:-2px; bottom:-2px; background:#22c55e;
  }
  .user-pin .st.old { background:#94a3b8; }
  .cluster-pill {
    display:inline-flex; align-items:center; gap:3px;
    padding:3px; background:#ffffff; border:2.5px solid #ffffff;
    border-radius:999px; box-shadow:0 4px 14px rgba(15,23,42,.36);
    box-sizing:border-box;
  }
  .cluster-av {
    width:32px; height:32px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    position:relative; flex-shrink:0; overflow:visible;
  }
  .cluster-av svg { width:17px; height:17px; fill:#fff; }
  .cluster-av img { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
  .cluster-av .st {
    width:9px; height:9px; border-radius:50%; border:1.5px solid #fff;
    position:absolute; right:-1px; bottom:-1px; background:#22c55e;
  }
  .cluster-av .st.old { background:#94a3b8; }
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
const map = L.map("map", { zoomControl: false, maxZoom: 20 }).setView([-6.8, 110.84], 13);
L.tileLayer("${SERVER_URL}/api/tile/{z}/{x}/{y}.png", {
  maxZoom: 20,
  maxNativeZoom: 18,
  attribution: "&copy; Maps"
}).addTo(map);
setTimeout(() => map.invalidateSize(), 150);
setTimeout(() => map.invalidateSize(), 700);

let currentDevices = [];
let clusterMarkers = [];
let historyLayers = [];
let highlightLayers = [];
let lastHistoryPoints = [];
let lastHistorySegments = [];
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
  if (!pickActive) {
    sendMsg({ type: "map_interact" });
    return;
  }
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  updatePickVisual(lat, lng, pickCircle ? pickCircle.getRadius() : 50);
  sendMsg({ type: "picked", lat, lng });
});
map.on("dragstart", function() {
  sendMsg({ type: "map_interact" });
});
map.on("zoomend", function() {
  renderDeviceGroups();
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

function renderDeviceGroups() {
  clusterMarkers.forEach((m) => map.removeLayer(m));
  clusterMarkers = [];
  const list = currentDevices;
  if (!list.length) return;

  const THRESHOLD_PX = 42;
  const zoom = map.getZoom();
  const groups = [];

  for (const d of list) {
    const pt = map.project([d.lat, d.lng], zoom);
    let targetGroup = null;
    for (const g of groups) {
      const dx = pt.x - g.cx;
      const dy = pt.y - g.cy;
      if (Math.hypot(dx, dy) <= THRESHOLD_PX) {
        targetGroup = g;
        break;
      }
    }
    if (targetGroup) {
      targetGroup.items.push(d);
      const n = targetGroup.items.length;
      targetGroup.cx = (targetGroup.cx * (n - 1) + pt.x) / n;
      targetGroup.cy = (targetGroup.cy * (n - 1) + pt.y) / n;
    } else {
      groups.push({ cx: pt.x, cy: pt.y, items: [d] });
    }
  }

  for (const g of groups) {
    const avgLat = g.items.reduce((s, d) => s + d.lat, 0) / g.items.length;
    const avgLng = g.items.reduce((s, d) => s + d.lng, 0) / g.items.length;

    if (g.items.length === 1) {
      const d = g.items[0];
      const online = Date.now() - (d.last_seen || d.updated_at) < 60000;
      const col = d.color || "#0284c7";
      const inner = d.photo ? '<img src="' + esc(d.photo) + '" alt="" />' : USER_SVG;
      const html = '<div class="user-pin" style="background:' + esc(col) + '">' + inner + '<span class="st ' + (online ? "" : "old") + '"></span></div>';
      const icon = L.divIcon({ className: "", html, iconSize: [38, 38], iconAnchor: [19, 19] });
      const m = L.marker([d.lat, d.lng], { icon }).addTo(map);
      m.on("click", () => sendMsg({ type: "select", device_id: d.device_id }));
      clusterMarkers.push(m);
    } else {
      const itemsHtml = g.items.map((d) => {
        const online = Date.now() - (d.last_seen || d.updated_at) < 60000;
        const col = d.color || "#0284c7";
        const inner = d.photo ? '<img src="' + esc(d.photo) + '" alt="" />' : USER_SVG;
        return '<div class="cluster-av" style="background:' + esc(col) + '">' + inner + '<span class="st ' + (online ? "" : "old") + '"></span></div>';
      }).join("");
      const width = g.items.length * 32 + (g.items.length - 1) * 3 + 11;
      const height = 43;
      const html = '<div class="cluster-pill">' + itemsHtml + '</div>';
      const icon = L.divIcon({ className: "", html, iconSize: [width, height], iconAnchor: [width / 2, height / 2] });
      const m = L.marker([avgLat, avgLng], { icon }).addTo(map);
      m.on("click", () => {
        const bounds = L.latLngBounds(g.items.map((d) => [d.lat, d.lng]));
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
          map.setView([avgLat, avgLng], Math.min(20, map.getZoom() + 2), { animate: true });
        } else {
          map.fitBounds(bounds, { padding: [70, 70], maxZoom: 19 });
        }
      });
      clusterMarkers.push(m);
    }
  }
}

window.updateDevices = function(list) {
  currentDevices = (list || []).filter((d) => d.platform === "ios" || d.platform === "android");
  renderDeviceGroups();
  if (!didAutoCenter && currentDevices.length) {
    didAutoCenter = true;
    if (currentDevices.length === 1) {
      map.setView([currentDevices[0].lat, currentDevices[0].lng], 16);
    } else {
      map.fitBounds(currentDevices.map((d) => [d.lat, d.lng]), { padding: [50, 50] });
    }
  }
};

window.focusDevice = function(lat, lng) {
  map.setView([lat, lng], 18, { animate: true });
};

function clearHistoryMap() {
  historyLayers.forEach((l) => map.removeLayer(l));
  historyLayers = [];
  highlightLayers.forEach((l) => map.removeLayer(l));
  highlightLayers = [];
}

function drawBaseHistory(points, segments, muted) {
  clearHistoryMap();
  if (!points || !points.length) return [];
  const latlngs = points.map((p) => [p.lat, p.lng]);
  if (latlngs.length >= 2) {
    if (muted) {
      const grayBorder = L.polyline(latlngs, { color: "#64748b", weight: 7, opacity: 0.45, lineJoin: "round", lineCap: "round" }).addTo(map);
      const grayLine = L.polyline(latlngs, { color: "#94a3b8", weight: 4, opacity: 0.78, lineJoin: "round", lineCap: "round" }).addTo(map);
      historyLayers.push(grayBorder, grayLine);
    } else {
      const border = L.polyline(latlngs, { color: "#14532d", weight: 9, opacity: 0.75, lineJoin: "round", lineCap: "round" }).addTo(map);
      const greenLine = L.polyline(latlngs, { color: "#22c55e", weight: 5, opacity: 0.98, lineJoin: "round", lineCap: "round" }).addTo(map);
      historyLayers.push(border, greenLine);
    }
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
  return latlngs;
}

window.setHistoryRoute = function(points, segments) {
  lastHistoryPoints = points || [];
  lastHistorySegments = segments || [];
  const latlngs = drawBaseHistory(lastHistoryPoints, lastHistorySegments, false);
  if (!latlngs.length) return;
  if (latlngs.length === 1) {
    map.setView(latlngs[0], 16);
  } else {
    map.fitBounds(latlngs, { padding: [36, 36] });
  }
};

window.resetHistoryHighlight = function() {
  const latlngs = drawBaseHistory(lastHistoryPoints, lastHistorySegments, false);
  if (latlngs.length >= 2) {
    map.fitBounds(latlngs, { padding: [36, 36] });
  } else if (latlngs.length === 1) {
    map.setView(latlngs[0], 16);
  }
};

window.highlightSegment = function(lat, lng, tripPoints) {
  if (Array.isArray(tripPoints) && tripPoints.length >= 2) {
    drawBaseHistory(lastHistoryPoints, lastHistorySegments, true);
    const border = L.polyline(tripPoints, { color: "#14532d", weight: 10, opacity: 0.85, lineJoin: "round", lineCap: "round" }).addTo(map);
    const greenLine = L.polyline(tripPoints, { color: "#22c55e", weight: 6, opacity: 1, lineJoin: "round", lineCap: "round" }).addTo(map);
    highlightLayers.push(border, greenLine);
    map.fitBounds(greenLine.getBounds(), { padding: [44, 44] });
  } else if (typeof lat === "number" && typeof lng === "number") {
    drawBaseHistory(lastHistoryPoints, lastHistorySegments, false);
    map.setView([lat, lng], 17, { animate: true });
  }
};
</script>
</body>
</html>`;
