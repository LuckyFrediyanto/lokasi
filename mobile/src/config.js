export const DEFAULT_SERVER_URL = "https://lacak-hp-server.azko-kudus.workers.dev";

export const STORE_KEYS = {
  SERVER_URL: "lacak_server_url",
  TOKEN: "lacak_auth_token",
  USERNAME: "lacak_username",
  DEVICE_ID: "lacak_device_id",
};

export function normalizeServerUrl(raw) {
  const cleaned = String(raw || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(cleaned)) return "";
  return cleaned;
}

export function toWsUrl(httpUrl, token) {
  const base = normalizeServerUrl(httpUrl).replace(/^http/i, "ws");
  return `${base}/api/ws?token=${encodeURIComponent(token)}`;
}
