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
      server.send(JSON.stringify({ type: "snapshot", devices: this.core.listLocations() }));
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
    if (msg.type === "location") {
      const att = ws.deserializeAttachment();
      const user = att ? this.core.authenticateToken(att.token) : null;
      if (!user) {
        ws.close(4001, "Sesi tidak valid");
        return;
      }
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(DASHBOARD_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    const stub = env.LOCATION_HUB.getByName("main");
    return stub.fetch(request);
  },
};
