export const SERVER_URL = "https://lacak-hp-server.luckyfrediyanto.workers.dev";

export const STORE_KEYS = {
  TOKEN: "lacak_auth_token",
  USERNAME: "lacak_username",
  DEVICE_ID: "lacak_device_id",
  BATTERY_OK: "lacak_battery_exempt_v1",
};

export function toWsUrl(token) {
  const base = SERVER_URL.replace(/^http/i, "ws");
  return `${base}/api/ws?token=${encodeURIComponent(token)}`;
}
