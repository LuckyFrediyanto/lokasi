const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 200;
const HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;
const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;
const DEVICE_ID_RE = /^[a-zA-Z0-9._:-]{2,80}$/;
const ALLOWED_PLATFORMS = new Set(["ios", "android", "web"]);

const encoder = new TextEncoder();

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password, saltBytes = null) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 500000) return false;
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    expected.length * 8
  );
  return timingSafeEqual(new Uint8Array(bits), expected);
}

function randomToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

function normalizeUsername(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return USERNAME_RE.test(value) ? value : null;
}

function validPassword(raw) {
  return typeof raw === "string" && raw.length >= 6 && raw.length <= 128;
}

function finiteNumber(v, min, max) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

function optionalFinite(v, min, max) {
  if (v === null || v === undefined) return null;
  return finiteNumber(v, min, max);
}

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

export class LocationHubCore {
  constructor(sql, broadcastFn = () => {}) {
    this.sql = sql;
    this.broadcast = broadcastFn;
    this.loginAttempts = new Map();
    this.initSchema();
  }

  initSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(username);
      CREATE TABLE IF NOT EXISTS locations (
        device_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('ios', 'android', 'web')),
        device_name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        accuracy REAL,
        altitude REAL,
        speed REAL,
        heading REAL,
        battery REAL,
        charging INTEGER,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(username);
      CREATE TABLE IF NOT EXISTS location_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        username TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        accuracy REAL,
        battery REAL,
        recorded_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_device_time ON location_history(device_id, recorded_at DESC);
    `);
  }

  async ensureSeedAdmin() {
    const row = this.sql.exec("SELECT COUNT(*) AS n FROM users").toArray()[0];
    if (row && Number(row.n) > 0) return;
    const hash = await hashPassword("123456");
    this.sql.exec(
      "INSERT OR IGNORE INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)",
      "admin",
      hash,
      Date.now()
    );
  }

  checkRateLimit(username) {
    const now = Date.now();
    const rec = this.loginAttempts.get(username);
    if (!rec || now - rec.windowStart > 15 * 60 * 1000) return true;
    return rec.count < 10;
  }

  recordFailedLogin(username) {
    const now = Date.now();
    const rec = this.loginAttempts.get(username);
    if (!rec || now - rec.windowStart > 15 * 60 * 1000) {
      this.loginAttempts.set(username, { count: 1, windowStart: now });
    } else {
      rec.count += 1;
    }
  }

  clearFailedLogin(username) {
    this.loginAttempts.delete(username);
  }

  authenticateToken(token) {
    if (typeof token !== "string" || token.length < 32) return null;
    const now = Date.now();
    const rows = this.sql.exec(
      `SELECT s.token, s.username, s.expires_at, u.role
       FROM sessions s
       JOIN users u ON u.username = s.username
       WHERE s.token = ?`,
      token
    ).toArray();
    if (!rows.length) return null;
    const row = rows[0];
    if (Number(row.expires_at) <= now) {
      this.sql.exec("DELETE FROM sessions WHERE token = ?", token);
      return null;
    }
    return { token: row.token, username: row.username, role: row.role };
  }

  extractToken(request) {
    const auth = request.headers.get("authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) {
      return auth.slice(7).trim();
    }
    return null;
  }

  listLocations() {
    return this.sql.exec(
      `SELECT device_id, username, platform, device_name, lat, lng,
              accuracy, altitude, speed, heading, battery, charging, updated_at
       FROM locations
       ORDER BY updated_at DESC`
    ).toArray();
  }

  saveLocation(user, body) {
    const lat = finiteNumber(body.lat, -90, 90);
    const lng = finiteNumber(body.lng, -180, 180);
    if (lat === null || lng === null) {
      return { error: "Koordinat lat/lng tidak valid", status: 400 };
    }
    const platformRaw = typeof body.platform === "string" ? body.platform.toLowerCase().trim() : "web";
    const platform = ALLOWED_PLATFORMS.has(platformRaw) ? platformRaw : "web";
    const rawDeviceId = typeof body.device_id === "string" && DEVICE_ID_RE.test(body.device_id.trim())
      ? body.device_id.trim()
      : `${user.username}:${platform}`;
    const deviceId = rawDeviceId.startsWith(`${user.username}:`)
      ? rawDeviceId
      : `${user.username}:${rawDeviceId}`.slice(0, 80);
    const deviceName = typeof body.device_name === "string" && body.device_name.trim()
      ? body.device_name.trim().slice(0, 64)
      : `${user.username} (${platform.toUpperCase()})`;

    const accuracy = optionalFinite(body.accuracy, 0, 100000);
    const altitude = optionalFinite(body.altitude, -1000, 100000);
    const speed = optionalFinite(body.speed, 0, 1000);
    const heading = optionalFinite(body.heading, 0, 360);
    const battery = optionalFinite(body.battery, 0, 100);
    const charging = body.charging === true ? 1 : body.charging === false ? 0 : null;
    const now = Date.now();
    const updatedAt = finiteNumber(body.timestamp, now - 7 * 86400000, now + 60000) || now;

    this.sql.exec(
      `INSERT INTO locations (
        device_id, username, platform, device_name, lat, lng,
        accuracy, altitude, speed, heading, battery, charging, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        username = excluded.username,
        platform = excluded.platform,
        device_name = excluded.device_name,
        lat = excluded.lat,
        lng = excluded.lng,
        accuracy = excluded.accuracy,
        altitude = excluded.altitude,
        speed = excluded.speed,
        heading = excluded.heading,
        battery = excluded.battery,
        charging = excluded.charging,
        updated_at = excluded.updated_at`,
      deviceId, user.username, platform, deviceName, lat, lng,
      accuracy, altitude, speed, heading, battery, charging, updatedAt
    );

    this.sql.exec(
      `INSERT INTO location_history (device_id, username, lat, lng, accuracy, battery, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      deviceId, user.username, lat, lng, accuracy, battery, updatedAt
    );

    this.sql.exec(
      `DELETE FROM location_history
       WHERE device_id = ?
         AND (recorded_at < ? OR id NOT IN (
           SELECT id FROM location_history WHERE device_id = ? ORDER BY recorded_at DESC LIMIT ?
         ))`,
      deviceId, now - HISTORY_MAX_AGE_MS, deviceId, HISTORY_LIMIT
    );

    const device = {
      device_id: deviceId,
      username: user.username,
      platform,
      device_name: deviceName,
      lat,
      lng,
      accuracy,
      altitude,
      speed,
      heading,
      battery,
      charging,
      updated_at: updatedAt,
    };

    this.broadcast({ type: "location", device });
    return { device, status: 200 };
  }

  async readJson(request) {
    try {
      const data = await request.json();
      return data && typeof data === "object" && !Array.isArray(data) ? data : null;
    } catch {
      return null;
    }
  }

  async handleApi(request) {
    await this.ensureSeedAdmin();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "lacak-hp-server", time: Date.now() });
    }

    if (path === "/api/auth/login" && request.method === "POST") {
      const body = await this.readJson(request);
      if (!body) return json({ error: "Payload JSON tidak valid" }, 400);
      const username = normalizeUsername(body.username);
      const password = body.password;
      if (!username || typeof password !== "string") {
        return json({ error: "Username dan password wajib diisi" }, 400);
      }
      if (!this.checkRateLimit(username)) {
        return json({ error: "Terlalu banyak percobaan login, coba lagi 15 menit" }, 429);
      }
      const rows = this.sql.exec(
        "SELECT username, password_hash, role FROM users WHERE username = ?",
        username
      ).toArray();
      if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
        this.recordFailedLogin(username);
        return json({ error: "Username atau password salah" }, 401);
      }
      this.clearFailedLogin(username);
      const now = Date.now();
      const token = randomToken();
      const expiresAt = now + SESSION_TTL_MS;
      this.sql.exec("DELETE FROM sessions WHERE expires_at <= ?", now);
      this.sql.exec(
        "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)",
        token, username, now, expiresAt
      );
      return json({
        token,
        expires_at: expiresAt,
        user: { username: rows[0].username, role: rows[0].role },
      });
    }

    const token = this.extractToken(request);
    const user = this.authenticateToken(token);
    if (!user) return json({ error: "Sesi tidak valid atau kedaluwarsa" }, 401);

    if (path === "/api/auth/me" && request.method === "GET") {
      return json({ user: { username: user.username, role: user.role } });
    }

    if (path === "/api/auth/logout" && request.method === "POST") {
      this.sql.exec("DELETE FROM sessions WHERE token = ?", user.token);
      return json({ ok: true });
    }

    if (path === "/api/location" && request.method === "POST") {
      const body = await this.readJson(request);
      if (!body) return json({ error: "Payload JSON tidak valid" }, 400);
      const result = this.saveLocation(user, body);
      if (result.error) return json({ error: result.error }, result.status);
      return json({ ok: true, device: result.device });
    }

    if (path === "/api/locations" && request.method === "GET") {
      return json({ devices: this.listLocations() });
    }

    const historyMatch = path.match(/^\/api\/locations\/([^/]+)\/history$/);
    if (historyMatch && request.method === "GET") {
      const deviceId = decodeURIComponent(historyMatch[1]);
      const rows = this.sql.exec(
        `SELECT lat, lng, accuracy, battery, recorded_at
         FROM location_history
         WHERE device_id = ?
         ORDER BY recorded_at ASC`,
        deviceId
      ).toArray();
      return json({ device_id: deviceId, points: rows });
    }

    const pingMatch = path.match(/^\/api\/locations\/([^/]+)\/ping$/);
    if (pingMatch && request.method === "POST") {
      const deviceId = decodeURIComponent(pingMatch[1]);
      const exists = this.sql.exec(
        "SELECT device_id, username FROM locations WHERE device_id = ?",
        deviceId
      ).toArray();
      if (!exists.length) return json({ error: "Perangkat tidak ditemukan" }, 404);
      this.broadcast({
        type: "ring",
        target_device_id: deviceId,
        target_username: exists[0].username,
        from_username: user.username,
        at: Date.now(),
      });
      return json({ ok: true });
    }

    const deleteLocMatch = path.match(/^\/api\/locations\/([^/]+)$/);
    if (deleteLocMatch && request.method === "DELETE") {
      const deviceId = decodeURIComponent(deleteLocMatch[1]);
      const rows = this.sql.exec(
        "SELECT device_id, username FROM locations WHERE device_id = ?",
        deviceId
      ).toArray();
      if (!rows.length) return json({ error: "Perangkat tidak ditemukan" }, 404);
      if (user.role !== "admin" && rows[0].username !== user.username) {
        return json({ error: "Tidak diizinkan menghapus perangkat user lain" }, 403);
      }
      this.sql.exec("DELETE FROM locations WHERE device_id = ?", deviceId);
      this.sql.exec("DELETE FROM location_history WHERE device_id = ?", deviceId);
      this.broadcast({ type: "device_removed", device_id: deviceId });
      return json({ ok: true });
    }

    if (path === "/api/users" && request.method === "GET") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      const users = this.sql.exec(
        "SELECT username, role, created_at FROM users ORDER BY created_at ASC"
      ).toArray();
      return json({ users });
    }

    if (path === "/api/users" && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      const body = await this.readJson(request);
      if (!body) return json({ error: "Payload JSON tidak valid" }, 400);
      const username = normalizeUsername(body.username);
      if (!username) {
        return json({ error: "Username 2-32 karakter (huruf kecil, angka, titik, strip, underscore)" }, 400);
      }
      if (!validPassword(body.password)) {
        return json({ error: "Password minimal 6 karakter" }, 400);
      }
      const role = body.role === "admin" ? "admin" : "user";
      const exists = this.sql.exec("SELECT username FROM users WHERE username = ?", username).toArray();
      if (exists.length) return json({ error: "Username sudah terdaftar" }, 409);
      const hash = await hashPassword(body.password);
      const now = Date.now();
      this.sql.exec(
        "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
        username, hash, role, now
      );
      return json({ ok: true, user: { username, role, created_at: now } }, 201);
    }

    if (path === "/api/users/password" && request.method === "PATCH") {
      const body = await this.readJson(request);
      if (!body) return json({ error: "Payload JSON tidak valid" }, 400);
      const targetUsername = body.username ? normalizeUsername(body.username) : user.username;
      if (!targetUsername) return json({ error: "Username tidak valid" }, 400);
      if (targetUsername !== user.username && user.role !== "admin") {
        return json({ error: "Khusus admin untuk ubah password user lain" }, 403);
      }
      if (!validPassword(body.new_password)) {
        return json({ error: "Password baru minimal 6 karakter" }, 400);
      }
      const rows = this.sql.exec("SELECT username FROM users WHERE username = ?", targetUsername).toArray();
      if (!rows.length) return json({ error: "User tidak ditemukan" }, 404);
      const hash = await hashPassword(body.new_password);
      this.sql.exec("UPDATE users SET password_hash = ? WHERE username = ?", hash, targetUsername);
      this.sql.exec("DELETE FROM sessions WHERE username = ? AND token != ?", targetUsername, user.token);
      return json({ ok: true });
    }

    const deleteUserMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (deleteUserMatch && request.method === "DELETE") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      const target = normalizeUsername(decodeURIComponent(deleteUserMatch[1]));
      if (!target) return json({ error: "Username tidak valid" }, 400);
      if (target === user.username) {
        return json({ error: "Tidak bisa menghapus akun sendiri" }, 400);
      }
      const rows = this.sql.exec("SELECT username FROM users WHERE username = ?", target).toArray();
      if (!rows.length) return json({ error: "User tidak ditemukan" }, 404);
      const deviceIds = this.sql.exec(
        "SELECT device_id FROM locations WHERE username = ?",
        target
      ).toArray().map((r) => r.device_id);
      this.sql.exec("DELETE FROM sessions WHERE username = ?", target);
      this.sql.exec("DELETE FROM locations WHERE username = ?", target);
      this.sql.exec("DELETE FROM location_history WHERE username = ?", target);
      this.sql.exec("DELETE FROM users WHERE username = ?", target);
      for (const deviceId of deviceIds) {
        this.broadcast({ type: "device_removed", device_id: deviceId });
      }
      return json({ ok: true });
    }

    return json({ error: "Endpoint tidak ditemukan" }, 404);
  }
}
