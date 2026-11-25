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
const hub = new LocationHubCore(createSqlAdapter(), (e) => events.push(e));

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
  body: { name: "Salah", lat: -6.81, lng: 110.85, radius: 75 },
}));
assert.equal(res.status, 400);

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

res = await hub.handleApi(req("/api/locations", { token: adminAuth.token }));
assert.equal((await res.json()).devices.length, 1);

res = await hub.handleApi(req("/api/auth/logout", {
  method: "POST",
  token: luckyAuth.token,
  body: { device_id: "poco" },
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/locations", { token: adminAuth.token }));
assert.equal((await res.json()).devices.length, 0);

res = await hub.handleApi(req(`/api/places/${rumah.id}`, {
  method: "DELETE",
  token: adminAuth.token,
}));
assert.equal(res.status, 200);

console.log("ALL_V2_TESTS_PASSED");
