import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import { Platform } from "react-native";
import { apiRequest, getDeviceDisplayName, getOrCreateDeviceId, getSession } from "./api";

export const LOCATION_TASK_NAME = "LACAK_HP_BACKGROUND_LOCATION";

async function readBattery() {
  try {
    const [level, state] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);
    return {
      battery: typeof level === "number" && level >= 0 ? Math.round(level * 100) : null,
      charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL,
    };
  } catch {
    return { battery: null, charging: null };
  }
}

export async function pushLocationPayload(coords, timestamp = Date.now()) {
  const { token, serverUrl } = await getSession();
  if (!token || !serverUrl) return null;
  const [deviceId, power] = await Promise.all([getOrCreateDeviceId(), readBattery()]);
  const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  return apiRequest(serverUrl, "/api/location", {
    method: "POST",
    token,
    body: {
      device_id: deviceId,
      platform,
      device_name: getDeviceDisplayName(),
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: typeof coords.accuracy === "number" && coords.accuracy >= 0 ? coords.accuracy : null,
      altitude: typeof coords.altitude === "number" ? coords.altitude : null,
      speed: typeof coords.speed === "number" && coords.speed >= 0 ? coords.speed : null,
      heading: typeof coords.heading === "number" && coords.heading >= 0 ? coords.heading : null,
      battery: power.battery,
      charging: power.charging,
      timestamp,
    },
  });
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error || !data || !Array.isArray(data.locations) || !data.locations.length) return;
  const latest = data.locations[data.locations.length - 1];
  if (!latest || !latest.coords) return;
  try {
    await pushLocationPayload(latest.coords, latest.timestamp || Date.now());
  } catch {}
});

export async function sendCurrentLocationNow() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    throw new Error("Izin lokasi ditolak");
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return pushLocationPayload(pos.coords, pos.timestamp || Date.now());
}

export async function isBackgroundTrackingActive() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

export async function startBackgroundTracking() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { ok: false, reason: "Izin lokasi saat aplikasi dipakai ditolak." };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    return {
      ok: false,
      reason: "Izin lokasi latar belakang ditolak. Aktifkan 'Selalu Izinkan' di Pengaturan HP.",
    };
  }
  const started = await isBackgroundTrackingActive();
  if (!started) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 10,
      deferredUpdatesInterval: 15000,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
      foregroundService: {
        notificationTitle: "Lacak HP Aktif",
        notificationBody: "Mengirim lokasi perangkat secara realtime di latar belakang.",
        notificationColor: "#38bdf8",
      },
    });
  }
  return { ok: true };
}

export async function stopBackgroundTracking() {
  const started = await isBackgroundTrackingActive();
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
