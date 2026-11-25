import { DurableObject } from "cloudflare:workers";
import { LocationHubCore, json } from "./hub.js";
import { DASHBOARD_HTML } from "./dashboard.js";

export class LocationHubDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new LocationHubCore(this.ctx.storage.sql, (payload) => this.broadcast(payload));
    this.ctx.blockConcurrencyWhile(async () => {
      await this.core.ensureSeedAdmin();
    });
  }

  broadcast(payload) {
    if (payload && payload.type === "force_logout") {
      for (const ws of this.ctx.getWebSockets(payload.username)) {
        try {
          const att = ws.deserializeAttachment();
          if (payload.except_token && att && att.token === payload.except_token) continue;
          ws.send(JSON.stringify({ type: "force_logout", username: payload.username }));
          ws.close(4001, "Sesi diakhiri");
        } catch {
          try { ws.close(); } catch {}
        }
      }
      return;
    }
    const encoded = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(encoded);
      } catch {
        try { ws.close(); } catch {}
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      await this.core.ensureSeedAdmin();
      const token = url.searchParams.get("token") || this.core.extractToken(request);
      const user = this.core.authenticateToken(token);
      if (!user) return json({ error: "Token WebSocket tidak valid" }, 401);

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [user.username]);
      server.serializeAttachment({ username: user.username, role: user.role, token });
      server.send(JSON.stringify({
        type: "snapshot",
        devices: this.core.listLocations(),
        places: this.core.listPlaces(),
        notifications: this.core.listNotifications(),
      }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return this.core.handleApi(request);
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
      return;
    }
    const att = ws.deserializeAttachment();
    const user = att ? this.core.authenticateToken(att.token) : null;
    if (!user) {
      ws.close(4001, "Sesi tidak valid");
      return;
    }
    if (msg.type === "heartbeat") {
      this.core.touchHeartbeat(user, msg.device_id);
      ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
      return;
    }
    if (msg.type === "location") {
      this.core.saveLocation(user, msg);
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch {}
  }

  async webSocketError(ws) {
    try { ws.close(); } catch {}
  }
}

async function handleMapTile(request, z, x, y, ctx) {
  let zi = Number(z);
  let xi = Number(x);
  let yi = Number(y);
  if (!Number.isInteger(zi) || zi < 0 || !Number.isInteger(xi) || xi < 0 || !Number.isInteger(yi) || yi < 0) {
    return new Response("Invalid tile", { status: 400 });
  }

  // Google tiles di beberapa wilayah Indonesia max level 18. Clamp ke 18 jika diminta di atasnya agar tidak muncul "Map data not yet available"
  if (zi > 18) {
    const diff = zi - 18;
    zi = 18;
    xi = Math.floor(xi / (1 << diff));
    yi = Math.floor(yi / (1 << diff));
  }

  const cache = caches.default;
  const canonicalUrl = new URL(request.url);
  canonicalUrl.pathname = `/api/tile/${zi}/${xi}/${yi}.png`;
  const cacheKey = new Request(canonicalUrl.toString(), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const sub = (xi + yi) % 4;
  const sources = [
    `https://mt${sub}.google.com/vt/lyrs=m&x=${xi}&y=${yi}&z=${zi}&hl=id`,
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zi}/${yi}/${xi}`,
    `https://tile.openstreetmap.org/${zi}/${xi}/${yi}.png`,
  ];

  for (const upstream of sources) {
    try {
      const res = await fetch(upstream, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      if (res.ok) {
        const body = await res.arrayBuffer();
        // Google tile "data not available" berukuran 2049 bytes
        if (body.byteLength > 2200 || (body.byteLength > 200 && !upstream.includes("google.com"))) {
          const out = new Response(body, {
            status: 200,
            headers: {
              "content-type": res.headers.get("content-type") || "image/png",
              "cache-control": "public, max-age=604800, immutable",
              "access-control-allow-origin": "*",
            },
          });
          ctx.waitUntil(cache.put(cacheKey, out.clone()));
          return out;
        }
      }
    } catch {}
  }
  return new Response("Tile unavailable", { status: 502 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(DASHBOARD_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    const tileMatch = url.pathname.match(/^\/api\/tile\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (tileMatch && request.method === "GET") {
      return handleMapTile(request, tileMatch[1], tileMatch[2], tileMatch[3], ctx);
    }
    const stub = env.LOCATION_HUB.getByName("main");
    return stub.fetch(request);
  },
};
