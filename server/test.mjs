import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { LocationHubCore } from "./src/hub.js";

function createSqlAdapter() {
  const db = new DatabaseSync(":memory:");
  return {
    exec(query, ...params) {
      if (params.length === 0 && query.includes(";")) {
        db.exec(query);
        return { toArray: () => [], one: () => undefined };
      }
      const stmt = db.prepare(query);
      if (/^\s*(SELECT|PRAGMA)\b/i.test(query)) {
        const rows = stmt.all(...params);
        return { toArray: () => rows, one: () => rows[0] };
      }
      stmt.run(...params);
      return { toArray: () => [], one: () => undefined };
    },
  };
}

function req(path, { method = "GET", token = null, body = null } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== null) headers["content-type"] = "application/json";
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
}

const events = [];
const hub = new LocationHubCore(createSqlAdapter(), (e) => events.push(e), {
  reverseGeocodeFn: async (lat) => (lat < -6.805 ? "Jl. Jenderal Sudirman, Kudus" : "Jl. Pemuda, Kudus"),
});

let res = await hub.handleApi(req("/api/health"));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "admin", password: "123456" },
}));
assert.equal(res.status, 200);
const adminAuth = await res.json();
assert.equal(adminAuth.user.username, "admin");
assert.equal(adminAuth.user.display_name, "Admin");

res = await hub.handleApi(req("/api/users", {
  method: "POST",
  token: adminAuth.token,
  body: { username: "lucky123", display_name: "Lucky", password: "abc", role: "user" },
}));
assert.equal(res.status, 400);

res = await hub.handleApi(req("/api/users", {
  method: "POST",
  token: adminAuth.token,
  body: { username: "lucky", display_name: "Lucky Frediyanto", password: "bebas", role: "user" },
}));
assert.equal(res.status, 201);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "lucky", password: "bebas" },
}));
assert.equal(res.status, 200);
const luckyAuth = await res.json();
assert.equal(luckyAuth.user.display_name, "Lucky Frediyanto");

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: luckyAuth.token,
  body: { device_id: "web-1", platform: "web", lat: -6.8, lng: 110.84 },
}));
assert.equal(res.status, 403);

res = await hub.handleApi(req("/api/places", {
  method: "POST",
  token: adminAuth.token,
  body: { name: "Rumah", lat: -6.8000, lng: 110.8400, radius: 50 },
}));
assert.equal(res.status, 201);
const rumah = (await res.json()).place;

res = await hub.handleApi(req("/api/places", {
  method: "POST",
  token: adminAuth.token,
  body: { name: "Kantor", lat: -6.8100, lng: 110.8500, radius: 100 },
}));
assert.equal(res.status, 201);

res = await hub.handleApi(req("/api/places", {
  method: "POST",
  token: adminAuth.token,
  body: { name: "Custom Radius", lat: -6.81, lng: 110.85, radius: 350 },
}));
assert.equal(res.status, 201);
const customPlace = (await res.json()).place;
assert.equal(customPlace.radius, 350);

res = await hub.handleApi(req("/api/places", {
  method: "POST",
  token: adminAuth.token,
  body: { name: "Salah Min", lat: -6.81, lng: 110.85, radius: 10 },
}));
assert.equal(res.status, 400);

res = await hub.handleApi(req(`/api/places/${customPlace.id}`, {
  method: "DELETE",
  token: adminAuth.token,
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: luckyAuth.token,
  body: {
    device_id: "poco",
    platform: "android",
    device_name: "Poco X8 Pro",
    lat: -6.8000,
    lng: 110.8400,
    battery: 88,
  },
}));
assert.equal(res.status, 200);
const notifs1 = events.filter((e) => e.type === "notification");
assert.equal(notifs1.length, 1);
assert.equal(notifs1[0].notification.message, "Lucky Frediyanto - Android Telah sampai di Rumah");
assert.equal(notifs1[0].notification.lat, -6.8);
assert.equal(notifs1[0].notification.lng, 110.84);

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: luckyAuth.token,
  body: {
    device_id: "poco",
    platform: "android",
    device_name: "Poco X8 Pro",
    lat: -6.8007,
    lng: 110.8400,
  },
}));
assert.equal(res.status, 200);
assert.equal(events.filter((e) => e.type === "notification").length, 1);

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: luckyAuth.token,
  body: {
    device_id: "poco",
    platform: "android",
    device_name: "Poco X8 Pro",
    lat: -6.80075,
    lng: 110.8400,
  },
}));
assert.equal(res.status, 200);
const notifs2 = events.filter((e) => e.type === "notification");
assert.equal(notifs2.length, 2);
assert.equal(notifs2[1].notification.message, "Lucky Frediyanto - Android pergi dari Rumah");

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: luckyAuth.token,
  body: {
    device_id: "poco",
    platform: "android",
    device_name: "Poco X8 Pro",
    lat: -6.8100,
    lng: 110.8500,
  },
}));
assert.equal(res.status, 200);
const notifs3 = events.filter((e) => e.type === "notification");
assert.equal(notifs3.length, 3);
assert.equal(notifs3[2].notification.message, "Lucky Frediyanto - Android Telah sampai di Kantor");

res = await hub.handleApi(req("/api/users/admin", {
  method: "PATCH",
  token: adminAuth.token,
  body: { username: "bos", display_name: "Bos Lucky", password: "barupassword" },
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/auth/me", { token: adminAuth.token }));
assert.equal(res.status, 200);
assert.equal((await res.json()).user.username, "bos");

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "bos", password: "barupassword" },
}));
assert.equal(res.status, 200);
const bosAuth = await res.json();
adminAuth.token = bosAuth.token;

res = await hub.handleApi(req("/api/locations", { token: adminAuth.token }));
assert.equal((await res.json()).devices.length, 1);

res = await hub.handleApi(req("/api/auth/logout", {
  method: "POST",
  token: luckyAuth.token,
  body: { device_id: "poco", password: "salah", require_password: true },
}));
assert.equal(res.status, 401);

res = await hub.handleApi(req("/api/auth/logout", {
  method: "POST",
  token: luckyAuth.token,
  body: { device_id: "poco", password: "bebas", require_password: true },
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/locations", { token: adminAuth.token }));
assert.equal((await res.json()).devices.length, 0);

res = await hub.handleApi(req(`/api/places/${rumah.id}`, {
  method: "DELETE",
  token: adminAuth.token,
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "lucky", password: "bebas" },
}));
const luckyAuth2 = await res.json();
const baseT = Date.now() - 3600000;
const pts = [
  { lat: -6.8000, lng: 110.8400, timestamp: baseT },
  { lat: -6.80005, lng: 110.84005, timestamp: baseT + 10 * 60000 },
  { lat: -6.8030, lng: 110.8430, timestamp: baseT + 15 * 60000 },
  { lat: -6.8070, lng: 110.8470, timestamp: baseT + 20 * 60000 },
  { lat: -6.8100, lng: 110.8500, timestamp: baseT + 25 * 60000 },
  { lat: -6.81002, lng: 110.85002, timestamp: baseT + 40 * 60000 },
];
for (const pt of pts) {
  res = await hub.handleApi(req("/api/location", {
    method: "POST",
    token: luckyAuth2.token,
    body: { device_id: "tripdev", platform: "android", device_name: "Poco", ...pt },
  }));
  assert.equal(res.status, 200);
}

res = await hub.handleApi(req("/api/locations/lucky%3Atripdev/history?days=1", {
  token: adminAuth.token,
}));
assert.equal(res.status, 200);
const hist = await res.json();
assert.ok(hist.total_distance_km > 1.0, `Expected >1km, got ${hist.total_distance_km}`);
assert.equal(hist.segments.length, 3);
assert.equal(hist.segments[0].type, "stay");
assert.equal(hist.segments[0].label, "Jl. Pemuda, Kudus");
assert.equal(hist.segments[1].type, "trip");
assert.equal(hist.segments[1].from_label, "Jl. Pemuda, Kudus");
assert.equal(hist.segments[1].to_label, "Kantor");
assert.ok(hist.segments[1].distance_km > 1.0);
assert.equal(hist.segments[2].type, "stay");
assert.equal(hist.segments[2].label, "Kantor");

const jitterT = Date.now() - 120000;
for (const pt of [
  { lat: -6.82000, lng: 110.86000, accuracy: 12, timestamp: jitterT },
  { lat: -6.82010, lng: 110.86008, accuracy: 15, timestamp: jitterT + 30000 },
  { lat: -6.82005, lng: 110.86015, accuracy: 18, timestamp: jitterT + 60000 },
  { lat: -6.82002, lng: 110.86004, accuracy: 10, timestamp: jitterT + 90000 },
]) {
  res = await hub.handleApi(req("/api/location", {
    method: "POST",
    token: luckyAuth2.token,
    body: { device_id: "stilldev", platform: "android", device_name: "Poco", ...pt },
  }));
  assert.equal(res.status, 200);
}
res = await hub.handleApi(req("/api/locations/lucky%3Astilldev/history?days=1", {
  token: adminAuth.token,
}));
assert.equal(res.status, 200);
const stillHist = await res.json();
assert.equal(stillHist.total_distance_km, 0);
assert.equal(stillHist.segments.length, 1);
assert.equal(stillHist.segments[0].type, "stay");

res = await hub.handleApi(req("/api/admin/logout-all", {
  method: "POST",
  token: adminAuth.token,
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/auth/me", { token: adminAuth.token }));
assert.equal(res.status, 401);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "bos", password: "barupassword", client_type: "mobile" },
}));
const freshAdmin = await res.json();
res = await hub.handleApi(req("/api/locations", { token: freshAdmin.token }));
assert.equal((await res.json()).devices.length, 0);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "lucky", password: "bebas", client_type: "mobile" },
}));
const phone1 = await res.json();
res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: phone1.token,
  body: { device_id: "hp1", platform: "android", device_name: "HP 1", lat: -6.8, lng: 110.84 },
}));
assert.equal(res.status, 200);
assert.ok((await res.json()).device.color.startsWith("#"));

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "lucky", password: "bebas", client_type: "mobile" },
}));
const phone2 = await res.json();
res = await hub.handleApi(req("/api/auth/me", { token: phone1.token }));
assert.equal(res.status, 401);

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: phone2.token,
  body: { device_id: "hp2", platform: "ios", device_name: "iPhone", lat: -6.81, lng: 110.85 },
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/locations/lucky%3Ahp2/ping", {
  method: "POST",
  token: freshAdmin.token,
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: phone2.token,
  body: { device_id: "hp2", platform: "ios", device_name: "iPhone", lat: -6.81, lng: 110.85 },
}));
assert.equal(res.status, 200);
const locWithRing = await res.json();
assert.ok(locWithRing.active_ring);
assert.equal(locWithRing.active_ring.from_display_name, "Bos Lucky");

res = await hub.handleApi(req("/api/locations/lucky%3Ahp2/stop-ping", {
  method: "POST",
  token: freshAdmin.token,
}));
assert.equal(res.status, 200);
assert.equal(events[events.length - 1].type, "stop_ring");

res = await hub.handleApi(req("/api/ring/pending?device_id=hp2", {
  token: phone2.token,
}));
assert.equal(res.status, 200);
assert.equal((await res.json()).active_ring, null);

res = await hub.handleApi(req("/api/users/lucky/logout", {
  method: "POST",
  token: freshAdmin.token,
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/auth/me", { token: phone2.token }));
assert.equal(res.status, 401);

res = await hub.handleApi(req("/api/locations", { token: freshAdmin.token }));
assert.equal((await res.json()).devices.length, 0);

res = await hub.handleApi(req("/api/notifications", { token: freshAdmin.token }));
const notifsAfterLogout = await res.json();
assert.equal(notifsAfterLogout.notifications.some((n) => n.username === "lucky"), false);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "lucky", password: "bebas", client_type: "mobile" },
}));
const luckyRelogin = await res.json();
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/notifications", { token: freshAdmin.token }));
const notifsAfterRelogin = await res.json();
assert.equal(notifsAfterRelogin.notifications.some((n) => n.username === "lucky"), true);

res = await hub.handleApi(req("/api/locations/lucky%3Ahp2/history?days=1", {
  token: luckyRelogin.token,
}));
assert.equal(res.status, 200);
const restoredHist = await res.json();
assert.ok(restoredHist.points.length > 0);

console.log("ALL_V4_TESTS_PASSED");
