import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { SERVER_URL, STORE_KEYS } from "./config";

export async function getSession() {
  const [token, username] = await Promise.all([
    SecureStore.getItemAsync(STORE_KEYS.TOKEN),
    SecureStore.getItemAsync(STORE_KEYS.USERNAME),
  ]);
  return { token, username, serverUrl: SERVER_URL };
}

export async function saveSession(token, username) {
  await Promise.all([
    SecureStore.setItemAsync(STORE_KEYS.TOKEN, token),
    SecureStore.setItemAsync(STORE_KEYS.USERNAME, username),
  ]);
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(STORE_KEYS.TOKEN),
    SecureStore.deleteItemAsync(STORE_KEYS.USERNAME),
  ]);
}

export async function getOrCreateDeviceId() {
  let id = await SecureStore.getItemAsync(STORE_KEYS.DEVICE_ID);
  if (!id) {
    const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    id = `${Platform.OS}-${rand}`;
    await SecureStore.setItemAsync(STORE_KEYS.DEVICE_ID, id);
  }
  return id;
}

export function getDeviceDisplayName() {
  const model = Device.modelName || Device.deviceName || Platform.OS.toUpperCase();
  return String(model).slice(0, 64);
}

export async function apiRequest(path, { method = "GET", token = null, body = null } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers["Content-Type"] = "application/json";
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
