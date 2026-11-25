const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 2000;
const HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STAY_RADIUS_M = 100;
const STAY_MIN_MS = 3 * 60 * 1000;
const TRIP_MIN_DISTANCE_M = 150;
const TRIP_MIN_EXCURSION_M = 100;
const MAX_TRUSTED_ACCURACY_M = 80;
const NOTIF_LIMIT = 50;
const ONLINE_WINDOW_MS = 90 * 1000;
const PBKDF2_ITERATIONS = 100000;
const USERNAME_RE = /^[a-z]{2,32}$/;
const DEVICE_ID_RE = /^[a-zA-Z0-9._:-]{2,80}$/;
const MOBILE_PLATFORMS = new Set(["ios", "android"]);
const ALLOWED_RADII = new Set([20, 50, 100, 200]);
const USER_COLORS = [
  "#38bdf8", "#22c55e", "#f59e0b", "#ec4899",
  "#a855f7", "#ef4444", "#14b8a6", "#f97316",
  "#6366f1", "#84cc16", "#06b6d4", "#e11d48",
];

export function userColor(username) {
  const s = String(username || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return USER_COLORS[h % USER_COLORS.length];
}

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

function normalizeDisplayName(raw, fallback) {
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().slice(0, 64);
  }
  return fallback;
}

function validPassword(raw) {
  return typeof raw === "string" && raw.length >= 1 && raw.length <= 128;
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

function platformLabel(platform) {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  return "Web";
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

async function defaultReverseGeocode(lat, lng) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&zoom=18&addressdetails=1&accept-language=id`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "LacakHP/1.1 (personal-location-tracker)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data?.address || {};
    const primary =
      data?.name ||
      addr.amenity ||
      addr.building ||
      addr.shop ||
      addr.road ||
      addr.pedestrian ||
      addr.neighbourhood ||
      addr.suburb ||
      addr.village;
    const area =
      addr.suburb ||
      addr.village ||
      addr.town ||
      addr.city ||
      addr.county ||
      addr.state;
    if (primary && area && primary.toLowerCase() !== area.toLowerCase()) {
      return `${primary}, ${area}`.slice(0, 80);
    }
    if (primary) return String(primary).slice(0, 80);
    if (typeof data?.display_name === "string" && data.display_name.trim()) {
      return data.display_name.split(",").slice(0, 2).join(",").trim().slice(0, 80);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class LocationHubCore {
  constructor(sql, broadcastFn = () => {}, options = {}) {
    this.sql = sql;
    this.broadcast = broadcastFn;
    this.reverseGeocodeFn = options.reverseGeocodeFn || defaultReverseGeocode;
    this.loginAttempts = new Map();
    this.initSchema();
  }

  initSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
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
        updated_at INTEGER NOT NULL,
        last_seen INTEGER,
        session_token TEXT
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
      CREATE TABLE IF NOT EXISTS places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        radius INTEGER NOT NULL CHECK(radius IN (20, 50, 100, 200)),
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS device_place_state (
        device_id TEXT PRIMARY KEY,
        place_id INTEGER,
        place_name TEXT,
        outside_streak INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL CHECK(event_type IN ('arrived', 'departed')),
        device_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        place_id INTEGER,
        place_name TEXT NOT NULL,
        lat REAL,
        lng REAL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_time ON notifications(created_at DESC);
      CREATE TABLE IF NOT EXISTS geocode_cache (
        grid_key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const userCols = new Set(
      this.sql.exec("PRAGMA table_info(users)").toArray().map((c) => c.name)
    );
    if (!userCols.has("display_name")) {
      this.sql.exec("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
    }
    this.sql.exec(
      "UPDATE users SET display_name = CASE WHEN username = 'admin' THEN 'Admin' ELSE username END WHERE display_name = '' OR display_name IS NULL"
    );

    const sessCols = new Set(
      this.sql.exec("PRAGMA table_info(sessions)").toArray().map((c) => c.name)
    );
    if (!sessCols.has("client_type")) {
      this.sql.exec("ALTER TABLE sessions ADD COLUMN client_type TEXT NOT NULL DEFAULT 'mobile'");
    }

    const locCols = new Set(
      this.sql.exec("PRAGMA table_info(locations)").toArray().map((c) => c.name)
    );
    if (!locCols.has("last_seen")) {
      this.sql.exec("ALTER TABLE locations ADD COLUMN last_seen INTEGER");
    }
    if (!locCols.has("session_token")) {
      this.sql.exec("ALTER TABLE locations ADD COLUMN session_token TEXT");
    }
    const notifCols = new Set(
      this.sql.exec("PRAGMA table_info(notifications)").toArray().map((c) => c.name)
    );
    if (!notifCols.has("lat")) {
      this.sql.exec("ALTER TABLE notifications ADD COLUMN lat REAL");
    }
    if (!notifCols.has("lng")) {
      this.sql.exec("ALTER TABLE notifications ADD COLUMN lng REAL");
    }
    this.sql.exec("DELETE FROM locations WHERE platform = 'web'");
  }

  async ensureSeedAdmin() {
    const row = this.sql.exec("SELECT COUNT(*) AS n FROM users").toArray()[0];
    if (row && Number(row.n) > 0) return;
    const hash = await hashPassword("123456");
    this.sql.exec(
      "INSERT OR IGNORE INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
      "admin",
      "Admin",
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
      `SELECT s.token, s.username, s.expires_at, u.display_name, u.role
       FROM sessions s
       JOIN users u ON u.username = s.username
       WHERE s.token = ?`,
      token
    ).toArray();
    if (!rows.length) return null;
    const row = rows[0];
    if (Number(row.expires_at) <= now) {
      this.sql.exec("DELETE FROM sessions WHERE token = ?", token);
      this.removeDevicesBySession(token);
      return null;
    }
    return {
      token: row.token,
      username: row.username,
      display_name: row.display_name || row.username,
      role: row.role,
    };
  }

  extractToken(request) {
    const auth = request.headers.get("authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) {
      return auth.slice(7).trim();
    }
    return null;
  }

  purgeExpiredSessionsAndDevices() {
    const now = Date.now();
    const expiredTokens = this.sql.exec(
      "SELECT token FROM sessions WHERE expires_at <= ?",
      now
    ).toArray().map((r) => r.token);
    if (expiredTokens.length) {
      this.sql.exec("DELETE FROM sessions WHERE expires_at <= ?", now);
      for (const tok of expiredTokens) {
        this.removeDevicesBySession(tok);
      }
    }
  }

  removeDevicesBySession(token) {
    const rows = this.sql.exec(
      "SELECT device_id FROM locations WHERE session_token = ?",
      token
    ).toArray();
    for (const r of rows) {
      this.sql.exec("DELETE FROM locations WHERE device_id = ?", r.device_id);
      this.sql.exec("DELETE FROM device_place_state WHERE device_id = ?", r.device_id);
      this.broadcast({ type: "device_removed", device_id: r.device_id });
    }
  }

  listLocations() {
    this.purgeExpiredSessionsAndDevices();
    const now = Date.now();
    const rows = this.sql.exec(
      `SELECT l.device_id, l.username, u.display_name, l.platform, l.device_name,
              l.lat, l.lng, l.accuracy, l.altitude, l.speed, l.heading,
              l.battery, l.charging, l.updated_at, l.last_seen,
              dps.place_name AS current_place
       FROM locations l
       JOIN users u ON u.username = l.username
       LEFT JOIN device_place_state dps ON dps.device_id = l.device_id
       WHERE l.platform IN ('ios', 'android')
         AND EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.username = l.username
             AND s.expires_at > ?
             AND (l.session_token IS NULL OR s.token = l.session_token)
         )
       ORDER BY l.updated_at DESC`,
      now
    ).toArray();
    return rows.map((r) => {
      const seen = Number(r.last_seen || r.updated_at || 0);
      return {
        ...r,
        display_name: r.display_name || r.username,
        color: userColor(r.username),
        last_seen: seen,
        online: now - seen < ONLINE_WINDOW_MS,
      };
    });
  }

  listPlaces() {
    return this.sql.exec(
      "SELECT id, name, lat, lng, radius, created_by, created_at FROM places ORDER BY created_at DESC"
    ).toArray();
  }

  listNotifications() {
    const rows = this.sql.exec(
      `SELECT n.id, n.event_type, n.device_id, n.username, n.display_name, n.platform,
              n.place_id, n.place_name,
              COALESCE(n.lat, p.lat) AS lat,
              COALESCE(n.lng, p.lng) AS lng,
              n.message, n.created_at
       FROM notifications n
       LEFT JOIN places p ON p.id = n.place_id
       ORDER BY n.created_at DESC
       LIMIT ?`,
      NOTIF_LIMIT
    ).toArray();
    return rows.map((r) => ({ ...r, color: userColor(r.username) }));
  }

  emitGeofenceNotification(eventType, device, place) {
    const pLabel = platformLabel(device.platform);
    const message =
      eventType === "arrived"
        ? `${device.display_name} - ${pLabel} Telah sampai di ${place.name}`
        : `${device.display_name} - ${pLabel} pergi dari ${place.name}`;
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO notifications (
        event_type, device_id, username, display_name, platform, place_id, place_name, lat, lng, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      eventType,
      device.device_id,
      device.username,
      device.display_name,
      device.platform,
      place.id,
      place.name,
      place.lat,
      place.lng,
      message,
      now
    );
    const created = this.sql.exec(
      `SELECT id, event_type, device_id, username, display_name, platform, place_id, place_name, lat, lng, message, created_at
       FROM notifications
       ORDER BY id DESC LIMIT 1`
    ).toArray()[0];
    this.sql.exec(
      `DELETE FROM notifications WHERE id NOT IN (
        SELECT id FROM notifications ORDER BY id DESC LIMIT ?
      )`,
      NOTIF_LIMIT
    );
    if (created) {
      created.color = userColor(created.username);
      this.broadcast({ type: "notification", notification: created });
    }
    return created;
  }

  evaluateGeofences(device) {
    const places = this.listPlaces();
    const stateRows = this.sql.exec(
      "SELECT device_id, place_id, place_name, outside_streak FROM device_place_state WHERE device_id = ?",
      device.device_id
    ).toArray();
    const state = stateRows[0] || null;
    const now = Date.now();

    let nearestInside = null;
    let nearestDist = Infinity;
    for (const p of places) {
      const dist = haversineMeters(device.lat, device.lng, p.lat, p.lng);
      if (dist <= p.radius && dist < nearestDist) {
        nearestInside = p;
        nearestDist = dist;
      }
    }

    if (!state || state.place_id == null) {
      if (nearestInside) {
        this.sql.exec(
          `INSERT INTO device_place_state (device_id, place_id, place_name, outside_streak, updated_at)
           VALUES (?, ?, ?, 0, ?)
           ON CONFLICT(device_id) DO UPDATE SET
             place_id = excluded.place_id,
             place_name = excluded.place_name,
             outside_streak = 0,
             updated_at = excluded.updated_at`,
          device.device_id,
          nearestInside.id,
          nearestInside.name,
          now
        );
        this.emitGeofenceNotification("arrived", device, nearestInside);
        return nearestInside.name;
      }
      return null;
    }

    const currentPlace = places.find((p) => Number(p.id) === Number(state.place_id));
    if (!currentPlace) {
      this.sql.exec("DELETE FROM device_place_state WHERE device_id = ?", device.device_id);
      if (nearestInside) {
        this.sql.exec(
          `INSERT INTO device_place_state (device_id, place_id, place_name, outside_streak, updated_at)
           VALUES (?, ?, ?, 0, ?)`,
          device.device_id,
          nearestInside.id,
          nearestInside.name,
          now
        );
        this.emitGeofenceNotification("arrived", device, nearestInside);
        return nearestInside.name;
      }
      return null;
    }

    if (nearestInside && Number(nearestInside.id) !== Number(currentPlace.id)) {
      this.emitGeofenceNotification("departed", device, currentPlace);
      this.sql.exec(
        `UPDATE device_place_state SET place_id = ?, place_name = ?, outside_streak = 0, updated_at = ?
         WHERE device_id = ?`,
        nearestInside.id,
        nearestInside.name,
        now,
        device.device_id
      );
      this.emitGeofenceNotification("arrived", device, nearestInside);
      return nearestInside.name;
    }

    const distToCurrent = haversineMeters(device.lat, device.lng, currentPlace.lat, currentPlace.lng);
    const exitBuffer = currentPlace.radius + 15;
    const fastExitThreshold = currentPlace.radius + 50;

    if (distToCurrent <= exitBuffer) {
      if (Number(state.outside_streak) !== 0) {
        this.sql.exec(
          "UPDATE device_place_state SET outside_streak = 0, updated_at = ? WHERE device_id = ?",
          now,
          device.device_id
        );
      }
      return currentPlace.name;
    }

    const nextStreak = Number(state.outside_streak || 0) + 1;
    if (nextStreak >= 2 || distToCurrent >= fastExitThreshold) {
      this.sql.exec(
        "UPDATE device_place_state SET place_id = NULL, place_name = NULL, outside_streak = 0, updated_at = ? WHERE device_id = ?",
        now,
        device.device_id
      );
      this.emitGeofenceNotification("departed", device, currentPlace);
      return null;
    }

    this.sql.exec(
      "UPDATE device_place_state SET outside_streak = ?, updated_at = ? WHERE device_id = ?",
      nextStreak,
      now,
      device.device_id
    );
    return currentPlace.name;
  }

  touchHeartbeat(user, rawDeviceId) {
    const now = Date.now();
    if (typeof rawDeviceId === "string" && DEVICE_ID_RE.test(rawDeviceId.trim())) {
      const cleaned = rawDeviceId.trim();
      const deviceId = cleaned.startsWith(`${user.username}:`)
        ? cleaned
        : `${user.username}:${cleaned}`.slice(0, 80);
      this.sql.exec(
        "UPDATE locations SET last_seen = ?, session_token = ? WHERE device_id = ? AND username = ?",
        now,
        user.token,
        deviceId,
        user.username
      );
    } else {
      this.sql.exec(
        "UPDATE locations SET last_seen = ? WHERE session_token = ? AND username = ?",
        now,
        user.token,
        user.username
      );
    }
  }

  saveLocation(user, body) {
    const lat = finiteNumber(body.lat, -90, 90);
    const lng = finiteNumber(body.lng, -180, 180);
    if (lat === null || lng === null) {
      return { error: "Koordinat lat/lng tidak valid", status: 400 };
    }
    const platformRaw = typeof body.platform === "string" ? body.platform.toLowerCase().trim() : "";
    if (!MOBILE_PLATFORMS.has(platformRaw)) {
      return { error: "Hanya aplikasi Android dan iOS yang dapat mengirim lokasi aktif", status: 403 };
    }
    const platform = platformRaw;
    const rawDeviceId = typeof body.device_id === "string" && DEVICE_ID_RE.test(body.device_id.trim())
      ? body.device_id.trim()
      : `${user.username}:${platform}`;
    const deviceId = rawDeviceId.startsWith(`${user.username}:`)
      ? rawDeviceId
      : `${user.username}:${rawDeviceId}`.slice(0, 80);
    const deviceName = typeof body.device_name === "string" && body.device_name.trim()
      ? body.device_name.trim().slice(0, 64)
      : `${user.display_name} (${platformLabel(platform)})`;

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
        accuracy, altitude, speed, heading, battery, charging, updated_at, last_seen, session_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        updated_at = excluded.updated_at,
        last_seen = excluded.last_seen,
        session_token = excluded.session_token`,
      deviceId, user.username, platform, deviceName, lat, lng,
      accuracy, altitude, speed, heading, battery, charging, updatedAt, now, user.token
    );

    const lastHist = this.sql.exec(
      `SELECT lat, lng, recorded_at FROM location_history
       WHERE device_id = ? ORDER BY recorded_at DESC LIMIT 1`,
      deviceId
    ).toArray()[0];
    const shouldAppendHistory =
      !lastHist ||
      updatedAt - Number(lastHist.recorded_at) >= 60000 ||
      haversineMeters(Number(lastHist.lat), Number(lastHist.lng), lat, lng) >= 8;

    if (shouldAppendHistory) {
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
    }

    const device = {
      device_id: deviceId,
      username: user.username,
      display_name: user.display_name,
      color: userColor(user.username),
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
      last_seen: now,
      online: true,
      current_place: null,
    };

    device.current_place = this.evaluateGeofences(device);
    this.broadcast({ type: "location", device });
    return { device, status: 200 };
  }

  async resolvePlaceLabel(lat, lng, places, remoteBudget) {
    let bestPlace = null;
    let bestDist = Infinity;
    for (const p of places) {
      const dist = haversineMeters(lat, lng, p.lat, p.lng);
      if (dist <= Math.max(p.radius, 60) && dist < bestDist) {
        bestPlace = p;
        bestDist = dist;
      }
    }
    if (bestPlace) return bestPlace.name;

    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.sql.exec(
      "SELECT label FROM geocode_cache WHERE grid_key = ?",
      key
    ).toArray()[0];
    if (cached && cached.label) return cached.label;

    if (remoteBudget.remaining > 0) {
      remoteBudget.remaining -= 1;
      const fetched = await this.reverseGeocodeFn(lat, lng);
      if (fetched) {
        this.sql.exec(
          `INSERT INTO geocode_cache (grid_key, label, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(grid_key) DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at`,
          key,
          fetched,
          Date.now()
        );
        return fetched;
      }
    }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  async buildTravelHistory(deviceId, days = 1) {
    const clampedDays = Math.min(7, Math.max(1, Number(days) || 1));
    const since = Date.now() - clampedDays * 24 * 60 * 60 * 1000;
    const rawRows = this.sql.exec(
      `SELECT lat, lng, accuracy, battery, recorded_at
       FROM location_history
       WHERE device_id = ? AND recorded_at >= ?
       ORDER BY recorded_at ASC`,
      deviceId,
      since
    ).toArray();

    const hasAccurate = rawRows.some((r) => r.accuracy == null || Number(r.accuracy) <= MAX_TRUSTED_ACCURACY_M);
    const points = [];
    for (const r of rawRows) {
      const acc = r.accuracy != null ? Number(r.accuracy) : null;
      if (hasAccurate && acc !== null && acc > MAX_TRUSTED_ACCURACY_M) continue;
      const pt = {
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracy: acc,
        battery: r.battery != null ? Number(r.battery) : null,
        recorded_at: Number(r.recorded_at),
      };
      if (points.length > 0) {
        const prev = points[points.length - 1];
        const dtSec = (pt.recorded_at - prev.recorded_at) / 1000;
        const dist = haversineMeters(prev.lat, prev.lng, pt.lat, pt.lng);
        if (dtSec > 0 && dist / dtSec > 70 && dist > 300) continue;
      }
      points.push(pt);
    }

    if (!points.length) {
      return { device_id: deviceId, days: clampedDays, total_distance_km: 0, points: [], route_points: [], segments: [] };
    }

    const places = this.listPlaces();
    const rawSegs = [];
    let i = 0;

    while (i < points.length) {
      let j = i + 1;
      while (j < points.length) {
        const d = haversineMeters(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
        if (d > STAY_RADIUS_M) break;
        j++;
      }
      const stayEnd = j - 1;
      const stayDur = points[stayEnd].recorded_at - points[i].recorded_at;
      if (stayDur >= STAY_MIN_MS || j >= points.length) {
        let sumLat = 0;
        let sumLng = 0;
        const count = stayEnd - i + 1;
        for (let k = i; k <= stayEnd; k++) {
          sumLat += points[k].lat;
          sumLng += points[k].lng;
        }
        rawSegs.push({
          type: "stay",
          start_at: points[i].recorded_at,
          end_at: points[stayEnd].recorded_at,
          lat: sumLat / count,
          lng: sumLng / count,
        });
        i = j;
        continue;
      }

      const tripStart = i > 0 ? i - 1 : i;
      let k = j;
      while (k < points.length) {
        let m = k + 1;
        while (m < points.length) {
          if (haversineMeters(points[k].lat, points[k].lng, points[m].lat, points[m].lng) > STAY_RADIUS_M) break;
          m++;
        }
        if (points[m - 1].recorded_at - points[k].recorded_at >= STAY_MIN_MS) {
          break;
        }
        k = m;
      }
      const tripEnd = Math.min(k, points.length - 1);
      const slice = points.slice(tripStart, tripEnd + 1);
      let distM = 0;
      let maxExcursion = 0;
      for (let s = 1; s < slice.length; s++) {
        distM += haversineMeters(slice[s - 1].lat, slice[s - 1].lng, slice[s].lat, slice[s].lng);
        const exc = haversineMeters(slice[0].lat, slice[0].lng, slice[s].lat, slice[s].lng);
        if (exc > maxExcursion) maxExcursion = exc;
      }
      if (distM < TRIP_MIN_DISTANCE_M || maxExcursion < TRIP_MIN_EXCURSION_M) {
        let sumLat = 0;
        let sumLng = 0;
        for (const p of slice) {
          sumLat += p.lat;
          sumLng += p.lng;
        }
        rawSegs.push({
          type: "stay",
          start_at: slice[0].recorded_at,
          end_at: slice[slice.length - 1].recorded_at,
          lat: sumLat / slice.length,
          lng: sumLng / slice.length,
        });
      } else {
        rawSegs.push({
          type: "trip",
          start_at: slice[0].recorded_at,
          end_at: slice[slice.length - 1].recorded_at,
          distance_km: Number((distM / 1000).toFixed(2)),
          start_lat: slice[0].lat,
          start_lng: slice[0].lng,
          end_lat: slice[slice.length - 1].lat,
          end_lng: slice[slice.length - 1].lng,
          points: slice.map((p) => [p.lat, p.lng]),
        });
      }
      i = k < points.length ? k : points.length;
    }

    const mergedSegs = [];
    for (const seg of rawSegs) {
      const prev = mergedSegs[mergedSegs.length - 1];
      if (
        prev &&
        prev.type === "stay" &&
        seg.type === "stay" &&
        haversineMeters(prev.lat, prev.lng, seg.lat, seg.lng) <= STAY_RADIUS_M * 1.2
      ) {
        prev.end_at = Math.max(prev.end_at, seg.end_at);
        prev.lat = (prev.lat + seg.lat) / 2;
        prev.lng = (prev.lng + seg.lng) / 2;
      } else {
        mergedSegs.push(seg);
      }
    }

    const remoteBudget = { remaining: 8 };
    const segments = [];
    const routePoints = [];
    let totalKm = 0;

    for (const seg of mergedSegs) {
      const durationMin = Math.max(1, Math.round((seg.end_at - seg.start_at) / 60000));
      if (seg.type === "stay") {
        const label = await this.resolvePlaceLabel(seg.lat, seg.lng, places, remoteBudget);
        segments.push({
          type: "stay",
          start_at: seg.start_at,
          end_at: seg.end_at,
          duration_min: durationMin,
          lat: seg.lat,
          lng: seg.lng,
          label,
        });
      } else {
        totalKm += seg.distance_km;
        for (const [plat, plng] of seg.points) {
          routePoints.push({ lat: plat, lng: plng });
        }
        const fromLabel = await this.resolvePlaceLabel(seg.start_lat, seg.start_lng, places, remoteBudget);
        const toLabel = await this.resolvePlaceLabel(seg.end_lat, seg.end_lng, places, remoteBudget);
        segments.push({
          type: "trip",
          start_at: seg.start_at,
          end_at: seg.end_at,
          duration_min: durationMin,
          distance_km: seg.distance_km,
          from_label: fromLabel,
          to_label: toLabel,
          start_lat: seg.start_lat,
          start_lng: seg.start_lng,
          end_lat: seg.end_lat,
          end_lng: seg.end_lng,
          points: seg.points,
        });
      }
    }

    return {
      device_id: deviceId,
      days: clampedDays,
      total_distance_km: Number(totalKm.toFixed(2)),
      points: routePoints.length ? routePoints : [{ lat: points[points.length - 1].lat, lng: points[points.length - 1].lng }],
      segments,
    };
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
      const rawUser = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      const password = body.password;
      if (!rawUser || typeof password !== "string") {
        return json({ error: "Username dan password wajib diisi" }, 400);
      }
      if (!this.checkRateLimit(rawUser)) {
        return json({ error: "Terlalu banyak percobaan login, coba lagi 15 menit" }, 429);
      }
      const rows = this.sql.exec(
        "SELECT username, display_name, password_hash, role FROM users WHERE username = ?",
        rawUser
      ).toArray();
      if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
        this.recordFailedLogin(rawUser);
        return json({ error: "Username atau password salah" }, 401);
      }
      this.clearFailedLogin(rawUser);
      const now = Date.now();
      const token = randomToken();
      const expiresAt = now + SESSION_TTL_MS;
      const clientType = body.client_type === "web" ? "web" : "mobile";
      this.purgeExpiredSessionsAndDevices();
      if (clientType === "mobile") {
        const oldDevs = this.sql.exec(
          "SELECT device_id FROM locations WHERE username = ?",
          rows[0].username
        ).toArray();
        this.sql.exec(
          "DELETE FROM sessions WHERE username = ? AND client_type = 'mobile'",
          rows[0].username
        );
        for (const d of oldDevs) {
          this.sql.exec("DELETE FROM locations WHERE device_id = ?", d.device_id);
          this.sql.exec("DELETE FROM device_place_state WHERE device_id = ?", d.device_id);
          this.broadcast({ type: "device_removed", device_id: d.device_id });
        }
        this.broadcast({
          type: "force_logout",
          username: rows[0].username,
          client_type: "mobile",
          except_token: token,
        });
      } else {
        this.sql.exec(
          "DELETE FROM sessions WHERE username = ? AND client_type = 'web'",
          rows[0].username
        );
      }
      this.sql.exec(
        "INSERT INTO sessions (token, username, created_at, expires_at, client_type) VALUES (?, ?, ?, ?, ?)",
        token, rows[0].username, now, expiresAt, clientType
      );
      return json({
        token,
        expires_at: expiresAt,
        user: {
          username: rows[0].username,
          display_name: rows[0].display_name || rows[0].username,
          color: userColor(rows[0].username),
          role: rows[0].role,
        },
      });
    }

    const token = this.extractToken(request);
    const user = this.authenticateToken(token);
    if (!user) return json({ error: "Sesi tidak valid atau kedaluwarsa" }, 401);

    if (path === "/api/auth/me" && request.method === "GET") {
      return json({
        user: { username: user.username, display_name: user.display_name, role: user.role },
      });
    }

    if (path === "/api/auth/logout" && request.method === "POST") {
      const body = (await this.readJson(request)) || {};
      const removedIds = new Set();
      const bySession = this.sql.exec(
        "SELECT device_id FROM locations WHERE session_token = ?",
        user.token
      ).toArray();
      for (const r of bySession) removedIds.add(r.device_id);

      if (typeof body.device_id === "string" && DEVICE_ID_RE.test(body.device_id.trim())) {
        const cleaned = body.device_id.trim();
        const fullId = cleaned.startsWith(`${user.username}:`)
          ? cleaned
          : `${user.username}:${cleaned}`.slice(0, 80);
        const byDev = this.sql.exec(
          "SELECT device_id FROM locations WHERE device_id = ? AND username = ?",
          fullId,
          user.username
        ).toArray();
        for (const r of byDev) removedIds.add(r.device_id);
      }

      this.sql.exec("DELETE FROM sessions WHERE token = ?", user.token);

      const remaining = this.sql.exec(
        "SELECT COUNT(*) AS n FROM sessions WHERE username = ? AND expires_at > ?",
        user.username,
        Date.now()
      ).toArray()[0];
      if (!remaining || Number(remaining.n) === 0) {
        const allUserDevs = this.sql.exec(
          "SELECT device_id FROM locations WHERE username = ?",
          user.username
        ).toArray();
        for (const r of allUserDevs) removedIds.add(r.device_id);
      }

      for (const devId of removedIds) {
        this.sql.exec("DELETE FROM locations WHERE device_id = ?", devId);
        this.sql.exec("DELETE FROM device_place_state WHERE device_id = ?", devId);
        this.broadcast({ type: "device_removed", device_id: devId });
      }
      return json({ ok: true });
    }

    if (path === "/api/heartbeat" && request.method === "POST") {
      const body = (await this.readJson(request)) || {};
      this.touchHeartbeat(user, body.device_id);
      return json({ ok: true, time: Date.now() });
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

    if (path === "/api/admin/logout-all" && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      this.sql.exec("DELETE FROM sessions");
      this.sql.exec("DELETE FROM locations");
      this.sql.exec("DELETE FROM device_place_state");
      this.broadcast({
        type: "snapshot",
        devices: [],
        places: this.listPlaces(),
        notifications: this.listNotifications(),
      });
      return json({ ok: true, cleared: true });
    }

    const historyMatch = path.match(/^\/api\/locations\/([^/]+)\/history$/);
    if (historyMatch && request.method === "GET") {
      const deviceId = decodeURIComponent(historyMatch[1]);
      const days = Number(url.searchParams.get("days") || 1);
      const history = await this.buildTravelHistory(deviceId, days);
      return json(history);
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
        from_display_name: user.display_name,
        at: Date.now(),
      });
      return json({ ok: true });
    }

    const stopPingMatch = path.match(/^\/api\/locations\/([^/]+)\/stop-ping$/);
    if (stopPingMatch && request.method === "POST") {
      const deviceId = decodeURIComponent(stopPingMatch[1]);
      const exists = this.sql.exec(
        "SELECT device_id, username FROM locations WHERE device_id = ?",
        deviceId
      ).toArray();
      if (!exists.length) return json({ error: "Perangkat tidak ditemukan" }, 404);
      this.broadcast({
        type: "stop_ring",
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
      this.sql.exec("DELETE FROM device_place_state WHERE device_id = ?", deviceId);
      this.broadcast({ type: "device_removed", device_id: deviceId });
      return json({ ok: true });
    }

    if (path === "/api/places" && request.method === "GET") {
      return json({ places: this.listPlaces() });
    }

    if (path === "/api/places" && request.method === "POST") {
      const body = await this.readJson(request);
      if (!body) return json({ error: "Payload JSON tidak valid" }, 400);
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 64) : "";
      if (!name) return json({ error: "Nama lokasi wajib diisi" }, 400);
      const lat = finiteNumber(body.lat, -90, 90);
      const lng = finiteNumber(body.lng, -180, 180);
      if (lat === null || lng === null) return json({ error: "Koordinat lokasi tidak valid" }, 400);
      const radius = Number(body.radius ?? 50);
      if (!ALLOWED_RADII.has(radius)) {
        return json({ error: "Radius harus salah satu dari 20, 50, 100, atau 200 meter" }, 400);
      }
      const now = Date.now();
      this.sql.exec(
        "INSERT INTO places (name, lat, lng, radius, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        name, lat, lng, radius, user.username, now
      );
      const place = this.sql.exec(
        "SELECT id, name, lat, lng, radius, created_by, created_at FROM places ORDER BY id DESC LIMIT 1"
      ).toArray()[0];
      const places = this.listPlaces();
      this.broadcast({ type: "places", places });
      return json({ ok: true, place, places }, 201);
    }

    const placeMatch = path.match(/^\/api\/places\/(\d+)$/);
    if (placeMatch && request.method === "PATCH") {
      const id = Number(placeMatch[1]);
      const existing = this.sql.exec(
        "SELECT id, name, lat, lng, radius FROM places WHERE id = ?",
        id
      ).toArray()[0];
      if (!existing) return json({ error: "Lokasi tidak ditemukan" }, 404);
      const body = await this.readJson(request);
      if (!body) return json({ error: "Payload JSON tidak valid" }, 400);
      const name = body.name !== undefined ? String(body.name).trim().slice(0, 64) : existing.name;
      if (!name) return json({ error: "Nama lokasi wajib diisi" }, 400);
      const lat = body.lat !== undefined ? finiteNumber(body.lat, -90, 90) : existing.lat;
      const lng = body.lng !== undefined ? finiteNumber(body.lng, -180, 180) : existing.lng;
      if (lat === null || lng === null) return json({ error: "Koordinat lokasi tidak valid" }, 400);
      const radius = body.radius !== undefined ? Number(body.radius) : existing.radius;
      if (!ALLOWED_RADII.has(radius)) {
        return json({ error: "Radius harus 20, 50, 100, atau 200 meter" }, 400);
      }
      this.sql.exec(
        "UPDATE places SET name = ?, lat = ?, lng = ?, radius = ? WHERE id = ?",
        name, lat, lng, radius, id
      );
      this.sql.exec(
        "UPDATE device_place_state SET place_name = ? WHERE place_id = ?",
        name, id
      );
      const places = this.listPlaces();
      this.broadcast({ type: "places", places });
      return json({ ok: true, places });
    }

    if (placeMatch && request.method === "DELETE") {
      const id = Number(placeMatch[1]);
      const existing = this.sql.exec("SELECT id FROM places WHERE id = ?", id).toArray()[0];
      if (!existing) return json({ error: "Lokasi tidak ditemukan" }, 404);
      this.sql.exec("DELETE FROM places WHERE id = ?", id);
      this.sql.exec("DELETE FROM device_place_state WHERE place_id = ?", id);
      const places = this.listPlaces();
      this.broadcast({ type: "places", places });
      return json({ ok: true, places });
    }

    if (path === "/api/notifications" && request.method === "GET") {
      return json({ notifications: this.listNotifications() });
    }

    if (path === "/api/users" && request.method === "GET") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      const now = Date.now();
      const users = this.sql.exec(
        `SELECT u.username, u.display_name, u.role, u.created_at,
                EXISTS(SELECT 1 FROM sessions s WHERE s.username = u.username AND s.expires_at > ?) AS has_session
         FROM users u
         ORDER BY u.created_at ASC`,
        now
      ).toArray().map((u) => ({
        ...u,
        color: userColor(u.username),
        logged_in: Boolean(u.has_session),
      }));
      return json({ users });
    }

    const userLogoutMatch = path.match(/^\/api\/users\/([^/]+)\/logout$/);
    if (userLogoutMatch && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      const target = decodeURIComponent(userLogoutMatch[1]).trim().toLowerCase();
      const existing = this.sql.exec("SELECT username FROM users WHERE username = ?", target).toArray()[0];
      if (!existing) return json({ error: "User tidak ditemukan" }, 404);
      const devs = this.sql.exec(
        "SELECT device_id FROM locations WHERE username = ?",
        target
      ).toArray();
      this.sql.exec("DELETE FROM sessions WHERE username = ?", target);
      for (const d of devs) {
        this.sql.exec("DELETE FROM locations WHERE device_id = ?", d.device_id);
        this.sql.exec("DELETE FROM device_place_state WHERE device_id = ?", d.device_id);
        this.broadcast({ type: "device_removed", device_id: d.device_id });
      }
      this.broadcast({ type: "force_logout", username: target });
      return json({ ok: true, username: target });
    }

    if (path === "/api/users" && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      const body = await this.readJson(request);
      if (!body) return json({ error: "Payload JSON tidak valid" }, 400);
      const username = normalizeUsername(body.username);
      if (!username) {
        return json({ error: "Username hanya boleh huruf (2-32 huruf, tanpa angka/simbol)" }, 400);
      }
      const displayName = normalizeDisplayName(body.display_name, username);
      if (!validPassword(body.password)) {
        return json({ error: "Password wajib diisi" }, 400);
      }
      const role = body.role === "admin" ? "admin" : "user";
      const exists = this.sql.exec("SELECT username FROM users WHERE username = ?", username).toArray();
      if (exists.length) return json({ error: "Username sudah terdaftar" }, 409);
      const hash = await hashPassword(body.password);
      const now = Date.now();
      this.sql.exec(
        "INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
        username, displayName, hash, role, now
      );
      return json({ ok: true, user: { username, display_name: displayName, role, created_at: now } }, 201);
    }

    const userItemMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userItemMatch && request.method === "PATCH") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      const oldUsername = decodeURIComponent(userItemMatch[1]).trim().toLowerCase();
      const existing = this.sql.exec(
        "SELECT username, display_name, role FROM users WHERE username = ?",
        oldUsername
      ).toArray()[0];
      if (!existing) return json({ error: "User tidak ditemukan" }, 404);

      const body = await this.readJson(request);
      if (!body) return json({ error: "Payload JSON tidak valid" }, 400);

      const nextUsername = body.username !== undefined
        ? normalizeUsername(body.username)
        : existing.username;
      if (!nextUsername) {
        return json({ error: "Username hanya boleh huruf (2-32 huruf, tanpa angka/simbol)" }, 400);
      }
      if (nextUsername !== existing.username) {
        const dup = this.sql.exec("SELECT username FROM users WHERE username = ?", nextUsername).toArray();
        if (dup.length) return json({ error: "Username baru sudah dipakai" }, 409);
      }

      const nextDisplayName = body.display_name !== undefined
        ? normalizeDisplayName(body.display_name, nextUsername)
        : existing.display_name || nextUsername;

      const nextRole = body.role === "admin" ? "admin" : body.role === "user" ? "user" : existing.role;
      if (existing.username === user.username && nextRole !== "admin") {
        return json({ error: "Admin tidak bisa menurunkan role dirinya sendiri" }, 400);
      }

      let newHash = null;
      if (typeof body.password === "string" && body.password.length > 0) {
        if (!validPassword(body.password)) {
          return json({ error: "Password tidak valid" }, 400);
        }
        newHash = await hashPassword(body.password);
      }

      if (newHash) {
        this.sql.exec(
          "UPDATE users SET username = ?, display_name = ?, role = ?, password_hash = ? WHERE username = ?",
          nextUsername, nextDisplayName, nextRole, newHash, existing.username
        );
      } else {
        this.sql.exec(
          "UPDATE users SET username = ?, display_name = ?, role = ? WHERE username = ?",
          nextUsername, nextDisplayName, nextRole, existing.username
        );
      }

      if (nextUsername !== existing.username) {
        this.sql.exec("UPDATE sessions SET username = ? WHERE username = ?", nextUsername, existing.username);
        const oldDevs = this.sql.exec(
          "SELECT device_id FROM locations WHERE username = ?",
          existing.username
        ).toArray();
        for (const d of oldDevs) {
          const suffix = d.device_id.startsWith(`${existing.username}:`)
            ? d.device_id.slice(existing.username.length + 1)
            : d.device_id;
          const nextDevId = `${nextUsername}:${suffix}`.slice(0, 80);
          this.sql.exec(
            "UPDATE locations SET device_id = ?, username = ? WHERE device_id = ?",
            nextDevId, nextUsername, d.device_id
          );
          this.sql.exec(
            "UPDATE location_history SET device_id = ?, username = ? WHERE device_id = ?",
            nextDevId, nextUsername, d.device_id
          );
          this.sql.exec(
            "UPDATE device_place_state SET device_id = ? WHERE device_id = ?",
            nextDevId, d.device_id
          );
        }
        this.sql.exec("UPDATE places SET created_by = ? WHERE created_by = ?", nextUsername, existing.username);
      }

      if (newHash) {
        this.sql.exec("DELETE FROM sessions WHERE username = ? AND token != ?", nextUsername, user.token);
      }

      this.broadcast({
        type: "snapshot",
        devices: this.listLocations(),
        places: this.listPlaces(),
        notifications: this.listNotifications(),
      });

      return json({
        ok: true,
        user: { username: nextUsername, display_name: nextDisplayName, role: nextRole },
      });
    }

    if (userItemMatch && request.method === "DELETE") {
      if (user.role !== "admin") return json({ error: "Khusus admin" }, 403);
      const target = decodeURIComponent(userItemMatch[1]).trim().toLowerCase();
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
      this.sql.exec("DELETE FROM device_place_state WHERE device_id IN (SELECT device_id FROM locations WHERE username = ?)", target);
      this.sql.exec("DELETE FROM users WHERE username = ?", target);
      for (const deviceId of deviceIds) {
        this.sql.exec("DELETE FROM device_place_state WHERE device_id = ?", deviceId);
        this.broadcast({ type: "device_removed", device_id: deviceId });
      }
      return json({ ok: true });
    }

    return json({ error: "Endpoint tidak ditemukan" }, 404);
  }
}
