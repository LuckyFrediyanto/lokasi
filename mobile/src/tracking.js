import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import { Platform } from "react-native";
import { apiRequest, getDeviceDisplayName, getOrCreateDeviceId, getSession } from "./api";
import { getActiveRingKey, startLoudRing, stopLoudRing } from "./alarm";

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

async function handleRingFromResponse(res) {
  if (!res) return;
  const ring = res.active_ring;
  if (ring && ring.started_at) {
    const key = String(ring.started_at);
    if (getActiveRingKey() !== key) {
      const caller = ring.from_display_name || ring.from_username || "Pengguna";
      await startLoudRing(caller, null, key);
    }
  } else if (getActiveRingKey()) {
    await stopLoudRing();
  }
}

export async function pushLocationPayload(coords, timestamp = Date.now()) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  const { token } = await getSession();
  if (!token) return null;
  const [deviceId, power] = await Promise.all([getOrCreateDeviceId(), readBattery()]);
  const res = await apiRequest("/api/location", {
    method: "POST",
    token,
    body: {
      device_id: deviceId,
      platform: Platform.OS,
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
  await handleRingFromResponse(res);
  return res;
}

export async function checkPendingRingNow() {
  try {
    const { token } = await getSession();
    if (!token) return;
    const deviceId = await getOrCreateDeviceId();
    const res = await apiRequest(`/api/ring/pending?device_id=${encodeURIComponent(deviceId)}`, {
      token,
    });
    await handleRingFromResponse(res);
  } catch {}
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error || !data || !Array.isArray(data.locations) || !data.locations.length) {
    await checkPendingRingNow();
    return;
  }
  const latest = data.locations[data.locations.length - 1];
  if (!latest || !latest.coords) {
    await checkPendingRingNow();
    return;
  }
  try {
    await pushLocationPayload(latest.coords, latest.timestamp || Date.now());
  } catch {}
});

export async function getCurrentCoords() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    throw new Error("Izin lokasi ditolak");
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return pos;
}

export async function sendCurrentLocationNow() {
  const pos = await getCurrentCoords();
  return pushLocationPayload(pos.coords, pos.timestamp || Date.now());
}

export async function startForegroundWatch() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return null;
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 5000,
      distanceInterval: 5,
    },
    (pos) => {
      if (pos && pos.coords) {
        pushLocationPayload(pos.coords, pos.timestamp || Date.now()).catch(() => {});
      }
    }
  );
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
  if (started) {
    try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch {}
  }
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 0,
    deferredUpdatesInterval: 5000,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Other,
    foregroundService: {
      notificationTitle: "Lacak HP Selalu Aktif",
      notificationBody: "Siaga melacak lokasi & menerima panggilan bunyikan HP.",
      notificationColor: "#0284c7",
      killServiceOnDestroy: false,
    },
  });
  return { ok: true };
}

export async function stopBackgroundTracking() {
  const started = await isBackgroundTrackingActive();
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
