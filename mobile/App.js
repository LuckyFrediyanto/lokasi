import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as IntentLauncher from "expo-intent-launcher";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { WebView } from "react-native-webview";
import { SERVER_URL, STORE_KEYS, toWsUrl } from "./src/config";
import { startLoudRing, stopLoudRing } from "./src/alarm";
import {
  apiRequest,
  clearSession,
  getOrCreateDeviceId,
  getSession,
  saveSession,
} from "./src/api";
import {
  getCurrentCoords,
  isBackgroundTrackingActive,
  sendCurrentLocationNow,
  startBackgroundTracking,
  startForegroundWatch,
  stopBackgroundTracking,
} from "./src/tracking";
import { MAP_HTML } from "./src/mapHtml";

const RADIUS_OPTIONS = [50, 100, 200, 300, 400, 500];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function formatAgo(ts) {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 10) return "baru saja";
  if (sec < 60) return `${sec}d lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  return `${Math.floor(hr / 24)}h lalu`;
}

function formatClock(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDuration(mins) {
  const m = Math.max(1, Math.round(mins || 1));
  if (m < 60) return `${m} menit`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}j ${rem}m` : `${h} jam`;
}

function osmMiniTile(lat, lng, z = 16) {
  const n = 2 ** z;
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xFloat);
  const y = Math.floor(yFloat);
  const px = Math.max(12, Math.min(88, (xFloat - x) * 100));
  const py = Math.max(12, Math.min(88, (yFloat - y) * 100));
  return {
    url: `${SERVER_URL}/api/tile/${z}/${x}/${y}.png`,
    px,
    py,
  };
}

async function setupNotifications() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("lokasi-alerts", {
        name: "Notifikasi Lokasi",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 200, 250],
      });
      await Notifications.setNotificationChannelAsync("alarm-ring", {
        name: "Panggilan Darurat Lacak HP",
        importance: Notifications.AndroidImportance.MAX,
        sound: "alarm.wav",
        bypassDnd: true,
        vibrationPattern: [0, 700, 300, 700, 300],
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
    }
    await Notifications.requestPermissionsAsync();
  } catch {}
}

async function openBatterySettings() {
  if (Platform.OS !== "android") return;
  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      { data: "package:com.pribadi.lacakhp" }
    );
    return;
  } catch {}
  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS"
    );
    return;
  } catch {}
  Linking.openSettings().catch(() => {});
}

async function showLocalOsNotification(message) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Lacak HP",
        body: message,
        sound: true,
        ...(Platform.OS === "android" ? { channelId: "lokasi-alerts" } : {}),
      },
      trigger: null,
    });
  } catch {}
}

function AppInner() {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? (RNStatusBar.currentHeight || 28) : 0
  );
  const bottomInset = insets.bottom;

  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [myDeviceId, setMyDeviceId] = useState("");

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [wsOnline, setWsOnline] = useState(false);
  const [bgActive, setBgActive] = useState(false);
  const [devices, setDevices] = useState([]);
  const [places, setPlaces] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [toastMsg, setToastMsg] = useState("");
  const [otaChecking, setOtaChecking] = useState(false);

  const [panelMode, setPanelMode] = useState("devices");
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyDays, setHistoryDays] = useState(1);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [tick, setTick] = useState(0);

  const [editingPlaceId, setEditingPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [placeRadius, setPlaceRadius] = useState(50);
  const [placeLat, setPlaceLat] = useState(-6.8048);
  const [placeLng, setPlaceLng] = useState(110.8405);
  const [placeErr, setPlaceErr] = useState("");

  const [ringingTargets, setRingingTargets] = useState({});
  const [ringCaller, setRingCaller] = useState(null);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [batteryPromptOpen, setBatteryPromptOpen] = useState(false);
  const [batteryOpenedOnce, setBatteryOpenedOnce] = useState(false);

  const [adminOpen, setAdminOpen] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [editingUsername, setEditingUsername] = useState(null);
  const [formUsername, setFormUsername] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhoto, setFormPhoto] = useState(null);
  const [formRole, setFormRole] = useState("user");
  const [adminErr, setAdminErr] = useState("");

  const screenH = Dimensions.get("window").height;
  const sheetMin = 36;
  const sheetMid = Math.round(screenH * 0.42);
  const sheetMax = screenH;
  const sheetHeight = useRef(new Animated.Value(sheetMid)).current;
  const currentSheetH = useRef(sheetMid);

  useEffect(() => {
    const id = sheetHeight.addListener((v) => {
      currentSheetH.current = v.value;
    });
    return () => sheetHeight.removeListener(id);
  }, [sheetHeight]);

  function animateSheetTo(target) {
    const clamped = Math.max(sheetMin, Math.min(sheetMax, target));
    currentSheetH.current = clamped;
    Animated.spring(sheetHeight, {
      toValue: clamped,
      friction: 9,
      tension: 60,
      useNativeDriver: false,
    }).start();
  }

  const topControlsOpacity = sheetHeight.interpolate({
    inputRange: [sheetMid, sheetMax - 60, sheetMax],
    outputRange: [1, 0.15, 0],
    extrapolate: "clamp",
  });
  const topControlsTranslateY = sheetHeight.interpolate({
    inputRange: [sheetMid, sheetMax],
    outputRange: [0, -50],
    extrapolate: "clamp",
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 3,
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(sheetMin, Math.min(sheetMax, currentSheetH.current - gesture.dy));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        let finalH = currentSheetH.current - gesture.dy;
        if (gesture.vy < -0.8 || finalH > screenH - 70) {
          finalH = sheetMax;
        } else if (gesture.vy > 0.8 || finalH < 70) {
          finalH = sheetMin;
        }
        animateSheetTo(finalH);
      },
    })
  ).current;

  const webRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const toastTimer = useRef(null);
  const watchSubRef = useRef(null);
  const ringTimersRef = useRef({});
  const panelModeRef = useRef(panelMode);

  useEffect(() => {
    panelModeRef.current = panelMode;
  }, [panelMode]);

  function showToast(text) {
    setToastMsg(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 6000);
  }

  function clearRingingTarget(deviceId) {
    if (ringTimersRef.current[deviceId]) {
      clearTimeout(ringTimersRef.current[deviceId]);
      delete ringTimersRef.current[deviceId];
    }
    setRingingTargets((prev) => {
      if (!prev[deviceId]) return prev;
      const next = { ...prev };
      delete next[deviceId];
      return next;
    });
  }

  async function checkManualUpdate() {
    if (otaChecking || __DEV__) return;
    setOtaChecking(true);
    showToast("Memeriksa update terbaru...");
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        showToast("Mengunduh update...");
        await Updates.fetchUpdateAsync();
        showToast("Menerapkan update...");
        await Updates.reloadAsync();
      } else {
        showToast("Aplikasi sudah versi terbaru");
      }
    } catch (e) {
      showToast("Gagal cek update: " + (e.message || "koneksi"));
    } finally {
      setOtaChecking(false);
    }
  }

  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [sess, devId, active, batDone] = await Promise.all([
        getSession(),
        getOrCreateDeviceId(),
        isBackgroundTrackingActive(),
        Platform.OS === "android"
          ? SecureStore.getItemAsync(STORE_KEYS.BATTERY_OK)
          : Promise.resolve("1"),
      ]);
      setMyDeviceId(devId);
      setBgActive(active);
      if (Platform.OS === "android" && batDone !== "1") {
        setBatteryPromptOpen(true);
      }
      if (sess.token) {
        try {
          const res = await apiRequest("/api/auth/me", { token: sess.token });
          setToken(sess.token);
          setUser(res.user);
          setupNotifications();
          const track = await startBackgroundTracking();
          setBgActive(track.ok);
        } catch {
          await clearSession();
        }
      }
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    webRef.current.injectJavaScript(`window.updateDevices(${JSON.stringify(devices)}); true;`);
  }, [devices, mapReady, tick]);

  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    if (panelMode === "places") {
      webRef.current.injectJavaScript(
        `window.setPickMode(true, ${Number(placeLat)}, ${Number(placeLng)}, ${Number(placeRadius)}); true;`
      );
    } else {
      webRef.current.injectJavaScript("window.setPickMode(false); true;");
    }
  }, [panelMode, placeLat, placeLng, placeRadius, mapReady]);

  useEffect(() => {
    if (!token || !user) return;
    let alive = true;

    (async () => {
      try {
        const sub = await startForegroundWatch();
        if (!alive) {
          sub?.remove();
        } else {
          watchSubRef.current = sub;
        }
      } catch {}
    })();

    return () => {
      alive = false;
      if (watchSubRef.current) {
        try { watchSubRef.current.remove(); } catch {}
        watchSubRef.current = null;
      }
    };
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return;
    let alive = true;
    let heartbeatTimer = null;
    let syncTimer = null;

    function upsert(dev) {
      if (dev.platform !== "ios" && dev.platform !== "android") return;
      setDevices((prev) => {
        const next = prev.filter((d) => d.device_id !== dev.device_id);
        next.push(dev);
        next.sort((a, b) => b.updated_at - a.updated_at);
        return next;
      });
    }

    function connect() {
      if (!alive) return;
      const ws = new WebSocket(toWsUrl(token));
      wsRef.current = ws;
      ws.onopen = () => {
        setWsOnline(true);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "heartbeat", device_id: myDeviceId }));
        }
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "heartbeat", device_id: myDeviceId }));
          }
        }, 25000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "snapshot") {
            if (Array.isArray(msg.devices)) {
              setDevices(
                msg.devices
                  .filter((d) => d.platform === "ios" || d.platform === "android")
                  .sort((a, b) => b.updated_at - a.updated_at)
              );
            }
            if (Array.isArray(msg.places)) setPlaces(msg.places);
            if (Array.isArray(msg.notifications)) setNotifications(msg.notifications);
          } else if (msg.type === "location" && msg.device) {
            upsert(msg.device);
          } else if (msg.type === "device_removed") {
            setDevices((prev) => prev.filter((d) => d.device_id !== msg.device_id));
            clearRingingTarget(msg.device_id);
          } else if (msg.type === "places" && Array.isArray(msg.places)) {
            setPlaces(msg.places);
          } else if (msg.type === "notification" && msg.notification) {
            setNotifications((prev) => [msg.notification, ...prev].slice(0, 50));
            if (panelModeRef.current !== "notifs") {
              setUnreadNotifs((n) => n + 1);
            }
            showToast(msg.notification.message);
            showLocalOsNotification(msg.notification.message);
          } else if (msg.type === "force_logout") {
            forceLocalSignOut("Sesi diakhiri oleh admin atau akun login di HP lain.");
          } else if (msg.type === "ring") {
            const fullMyId = `${user.username}:${myDeviceId}`;
            if (msg.target_device_id === fullMyId || msg.target_username === user.username) {
              const caller = msg.from_display_name || msg.from_username;
              setRingCaller(caller);
              startLoudRing(caller, () => setRingCaller(null));
            }
          } else if (msg.type === "stop_ring") {
            const fullMyId = `${user.username}:${myDeviceId}`;
            if (msg.target_device_id === fullMyId || msg.target_username === user.username) {
              stopLoudRing().catch(() => {});
              setRingCaller(null);
            }
            if (msg.target_device_id) clearRingingTarget(msg.target_device_id);
          }
        } catch {}
      };
      ws.onclose = (ev) => {
        setWsOnline(false);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (ev && ev.code === 4001) {
          forceLocalSignOut("Sesi diakhiri oleh admin atau akun login di HP lain.");
          return;
        }
        if (alive) reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();

    syncTimer = setInterval(async () => {
      try {
        await apiRequest("/api/heartbeat", {
          method: "POST",
          token,
          body: { device_id: myDeviceId },
        });
        const data = await apiRequest("/api/locations", { token });
        if (alive && Array.isArray(data.devices)) {
          setDevices(
            data.devices
              .filter((d) => d.platform === "ios" || d.platform === "android")
              .sort((a, b) => b.updated_at - a.updated_at)
          );
        }
      } catch (e) {
        if (String(e.message || "").toLowerCase().includes("sesi")) {
          clearSession().catch(() => {});
          if (alive) {
            setToken(null);
            setUser(null);
          }
        }
      }
    }, 30000);

    return () => {
      alive = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (syncTimer) clearInterval(syncTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
    };
  }, [token, user, myDeviceId]);

  async function forceLocalSignOut(reason) {
    try {
      await stopLoudRing();
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }
      await stopBackgroundTracking();
    } catch {}
    await clearSession();
    setRingCaller(null);
    setBgActive(false);
    setPanelMode("devices");
    setHistoryTarget(null);
    setHistoryData(null);
    setToken(null);
    setUser(null);
    setDevices([]);
    setPlaces([]);
    setNotifications([]);
    if (reason) Alert.alert("Logout", reason);
  }

  async function handleLogin() {
    setLoginErr("");
    setBusy(true);
    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
          username: loginUser.trim().toLowerCase(),
          password: loginPass,
          client_type: "mobile",
        },
      });
      await saveSession(data.token, data.user.username);
      setToken(data.token);
      setUser(data.user);
      setLoginPass("");
      setupNotifications();

      const track = await startBackgroundTracking();
      setBgActive(track.ok);
      if (!track.ok) Alert.alert("Izin Latar Belakang", track.reason);
      sendCurrentLocationNow().catch(() => {});
    } catch (e) {
      setLoginErr(e.message || "Gagal login");
    } finally {
      setBusy(false);
    }
  }

  function confirmLogout() {
    setLogoutModalOpen(true);
  }

  function handleLogout() {
    const oldToken = token;
    const oldDevId = myDeviceId;
    setLogoutModalOpen(false);
    setAdminOpen(false);
    setRingCaller(null);
    setBgActive(false);
    setPanelMode("devices");
    setHistoryTarget(null);
    setHistoryData(null);
    setToken(null);
    setUser(null);
    setDevices([]);
    setPlaces([]);
    setNotifications([]);
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (watchSubRef.current) {
      try { watchSubRef.current.remove(); } catch {}
      watchSubRef.current = null;
    }
    clearSession().catch(() => {});
    stopLoudRing().catch(() => {});
    stopBackgroundTracking().catch(() => {});
    if (oldToken) {
      apiRequest("/api/auth/logout", {
        method: "POST",
        token: oldToken,
        body: { device_id: oldDevId },
      }).catch(() => {});
    }
  }

  async function ensureBackgroundPermission() {
    const res = await startBackgroundTracking();
    setBgActive(res.ok);
    if (!res.ok) Alert.alert("Izin Latar Belakang", res.reason);
    else sendCurrentLocationNow().catch(() => {});
  }

  async function focusMyCurrentLocation() {
    try {
      const pos = await getCurrentCoords();
      if (webRef.current) {
        webRef.current.injectJavaScript(
          `window.focusDevice(${pos.coords.latitude}, ${pos.coords.longitude}); true;`
        );
      }
      sendCurrentLocationNow().catch(() => {});
    } catch (e) {
      const mine = devices.find((d) => d.device_id === `${user.username}:${myDeviceId}`);
      if (mine) focusDevice(mine);
      else Alert.alert("GPS", e.message || "Gagal mengambil lokasi saat ini");
    }
  }

  function focusDevice(d) {
    if (webRef.current) {
      webRef.current.injectJavaScript(`window.focusDevice(${d.lat}, ${d.lng}); true;`);
    }
  }

  async function openHistory(device, days = 1) {
    setHistoryTarget(device);
    setHistoryDays(days);
    setPanelMode("history");
    animateSheetTo(sheetMid);
    setHistoryLoading(true);
    try {
      const data = await apiRequest(
        `/api/locations/${encodeURIComponent(device.device_id)}/history?days=${days}`,
        { token }
      );
      setHistoryData(data);
      webRef.current?.injectJavaScript(
        `window.setHistoryRoute(${JSON.stringify(data.points || [])}, ${JSON.stringify(data.segments || [])}); true;`
      );
    } catch (e) {
      Alert.alert("History", e.message || "Gagal memuat riwayat");
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryTarget(null);
    setHistoryData(null);
    setPanelMode("devices");
    webRef.current?.injectJavaScript("window.setHistoryRoute([], []); true;");
  }

  function focusHistorySegment(seg) {
    if (!webRef.current) return;
    if (seg.type === "trip" && Array.isArray(seg.points)) {
      webRef.current.injectJavaScript(
        `window.highlightSegment(null, null, ${JSON.stringify(seg.points)}); true;`
      );
    } else if (typeof seg.lat === "number" && typeof seg.lng === "number") {
      webRef.current.injectJavaScript(`window.highlightSegment(${seg.lat}, ${seg.lng}, null); true;`);
    }
  }

  function openRoute(d) {
    const url = Platform.OS === "ios"
      ? `maps://?daddr=${d.lat},${d.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;
    Linking.openURL(url).catch(() => {});
  }

  async function pingDevice(deviceId) {
    try {
      await apiRequest(`/api/locations/${encodeURIComponent(deviceId)}/ping`, {
        method: "POST",
        token,
      });
      if (ringTimersRef.current[deviceId]) clearTimeout(ringTimersRef.current[deviceId]);
      setRingingTargets((prev) => ({ ...prev, [deviceId]: true }));
      ringTimersRef.current[deviceId] = setTimeout(() => {
        clearRingingTarget(deviceId);
      }, 30000);
      showToast("HP dibunyikan (maks 30 detik)");
    } catch (e) {
      Alert.alert("Gagal", e.message);
    }
  }

  async function stopPingDevice(deviceId) {
    try {
      await apiRequest(`/api/locations/${encodeURIComponent(deviceId)}/stop-ping`, {
        method: "POST",
        token,
      });
      clearRingingTarget(deviceId);
      showToast("Suara & getaran dihentikan");
    } catch (e) {
      clearRingingTarget(deviceId);
      Alert.alert("Gagal", e.message);
    }
  }

  async function togglePlacesPanel() {
    if (panelMode === "places") {
      setPanelMode("devices");
      return;
    }
    if (historyTarget) {
      setHistoryTarget(null);
      setHistoryData(null);
      webRef.current?.injectJavaScript("window.setHistoryRoute([], []); true;");
    }
    setPlaceErr("");
    setEditingPlaceId(null);
    setPlaceName("");
    setPlaceRadius(50);
    const mine = devices.find((d) => d.device_id === `${user.username}:${myDeviceId}`) || devices[0];
    if (mine) {
      setPlaceLat(mine.lat);
      setPlaceLng(mine.lng);
    } else {
      try {
        const pos = await getCurrentCoords();
        setPlaceLat(pos.coords.latitude);
        setPlaceLng(pos.coords.longitude);
      } catch {}
    }
    setPanelMode("places");
    animateSheetTo(sheetMid);
  }

  function toggleNotifsPanel() {
    if (panelMode === "notifs") {
      setPanelMode("devices");
      return;
    }
    if (historyTarget) {
      setHistoryTarget(null);
      setHistoryData(null);
      webRef.current?.injectJavaScript("window.setHistoryRoute([], []); true;");
    }
    setUnreadNotifs(0);
    setPanelMode("notifs");
    animateSheetTo(sheetMid);
  }

  async function snapPlaceToMyGps() {
    try {
      const pos = await getCurrentCoords();
      setPlaceLat(pos.coords.latitude);
      setPlaceLng(pos.coords.longitude);
    } catch (e) {
      Alert.alert("GPS", e.message || "Gagal ambil posisi saat ini");
    }
  }

  async function savePlace() {
    setPlaceErr("");
    const name = placeName.trim();
    if (!name) {
      setPlaceErr("Nama lokasi wajib diisi");
      return;
    }
    try {
      const body = { name, lat: Number(placeLat), lng: Number(placeLng), radius: placeRadius };
      const data = editingPlaceId
        ? await apiRequest(`/api/places/${editingPlaceId}`, { method: "PATCH", token, body })
        : await apiRequest("/api/places", { method: "POST", token, body });
      if (Array.isArray(data.places)) setPlaces(data.places);
      setEditingPlaceId(null);
      setPlaceName("");
      showToast(editingPlaceId ? `Lokasi "${name}" diperbarui` : `Lokasi "${name}" disimpan`);
    } catch (e) {
      setPlaceErr(e.message || "Gagal menyimpan lokasi");
    }
  }

  function startEditPlace(p) {
    setEditingPlaceId(p.id);
    setPlaceName(p.name);
    setPlaceLat(p.lat);
    setPlaceLng(p.lng);
    setPlaceRadius(p.radius);
    setPlaceErr("");
  }

  function removePlace(p) {
    Alert.alert("Hapus Lokasi", `Hapus lokasi "${p.name}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            const data = await apiRequest(`/api/places/${p.id}`, { method: "DELETE", token });
            if (Array.isArray(data.places)) setPlaces(data.places);
            if (editingPlaceId === p.id) {
              setEditingPlaceId(null);
              setPlaceName("");
            }
          } catch (e) {
            Alert.alert("Gagal", e.message);
          }
        },
      },
    ]);
  }

  function resetUserForm() {
    setEditingUsername(null);
    setFormUsername("");
    setFormDisplayName("");
    setFormPassword("");
    setFormPhoto(null);
    setFormRole("user");
    setAdminErr("");
  }

  async function openAdmin() {
    resetUserForm();
    setAdminOpen(true);
    try {
      const data = await apiRequest("/api/users", { token });
      setUsersList(data.users || []);
    } catch (e) {
      setAdminErr(e.message);
    }
  }

  function startEditUser(u) {
    setEditingUsername(u.username);
    setFormUsername(u.username);
    setFormDisplayName(u.display_name || u.username);
    setFormPassword("");
    setFormPhoto(u.photo || null);
    setFormRole(u.role);
    setAdminErr("");
  }

  async function pickUserPhoto() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (res.canceled || !res.assets || !res.assets.length) return;
      const asset = res.assets[0];
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 180, height: 180 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (manipulated.base64) {
        setFormPhoto(`data:image/jpeg;base64,${manipulated.base64}`);
      }
    } catch (e) {
      Alert.alert("Foto", e.message || "Gagal memilih foto");
    }
  }

  function deleteFormPhoto() {
    Alert.alert("Hapus Foto", "Foto profil akan dihapus dan kembali ke icon default?", [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: () => setFormPhoto(null) },
    ]);
  }

  async function saveUserForm() {
    setAdminErr("");
    const uname = formUsername.trim().toLowerCase().replace(/[^a-z]/g, "");
    const dname = formDisplayName.trim();
    if (uname.length < 2) {
      setAdminErr("Username minimal 2 huruf (huruf saja, tanpa angka/simbol)");
      return;
    }
    if (!dname) {
      setAdminErr("Nama wajib diisi");
      return;
    }
    if (!editingUsername && !formPassword) {
      setAdminErr("Password wajib diisi");
      return;
    }
    try {
      if (editingUsername) {
        const payload = {
          username: uname,
          display_name: dname,
          role: formRole,
          photo: formPhoto,
        };
        if (formPassword.length > 0) payload.password = formPassword;
        const res = await apiRequest(`/api/users/${encodeURIComponent(editingUsername)}`, {
          method: "PATCH",
          token,
          body: payload,
        });
        if (editingUsername === user.username && res.user) {
          setUser(res.user);
          await saveSession(token, res.user.username);
        }
      } else {
        await apiRequest("/api/users", {
          method: "POST",
          token,
          body: {
            username: uname,
            display_name: dname,
            password: formPassword,
            photo: formPhoto,
            role: formRole,
          },
        });
      }
      resetUserForm();
      const data = await apiRequest("/api/users", { token });
      setUsersList(data.users || []);
    } catch (e) {
      setAdminErr(e.message);
    }
  }

  function logoutUserByAdmin(uname) {
    Alert.alert("Logout User", `Keluarkan paksa akun @${uname} dari perangkatnya?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest(`/api/users/${encodeURIComponent(uname)}/logout`, {
              method: "POST",
              token,
            });
            showToast(`Akun @${uname} telah di-logout`);
            if (uname === user.username) {
              setAdminOpen(false);
              forceLocalSignOut(null);
              return;
            }
            const data = await apiRequest("/api/users", { token });
            setUsersList(data.users || []);
          } catch (e) {
            setAdminErr(e.message);
          }
        },
      },
    ]);
  }

  function deleteUser(uname) {
    Alert.alert("Hapus User", `Hapus akun @${uname}?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest(`/api/users/${encodeURIComponent(uname)}`, {
              method: "DELETE",
              token,
            });
            const data = await apiRequest("/api/users", { token });
            setUsersList(data.users || []);
          } catch (e) {
            setAdminErr(e.message);
          }
        },
      },
    ]);
  }

  const batteryModal = (
    <Modal visible={batteryPromptOpen} animationType="slide" transparent>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>Wajib: Nonaktifkan Penghemat Baterai</Text>
          <Text style={[styles.devMeta, { marginTop: 8, lineHeight: 19 }]}>
            Agar pelacakan lokasi latar belakang dan alarm bunyikan HP tetap berjalan 24 jam tanpa dimatikan sistem Android, silakan pilih "Izinkan / Tidak dibatasi" pada izin baterai aplikasi Lacak HP.
          </Text>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={async () => {
              setBatteryOpenedOnce(true);
              await openBatterySettings();
            }}
          >
            <Text style={styles.btnPrimaryText}>Buka Izin Baterai</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.btnSmall,
              { marginTop: 10, paddingVertical: 11, alignItems: "center", opacity: batteryOpenedOnce ? 1 : 0.45 },
            ]}
            disabled={!batteryOpenedOnce}
            onPress={async () => {
              await SecureStore.setItemAsync(STORE_KEYS.BATTERY_OK, "1");
              setBatteryPromptOpen(false);
            }}
          >
            <Text style={styles.btnSmallText}>Sudah Nonaktifkan, Lanjutkan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (booting) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar style="dark" backgroundColor="#f8fafc" translucent />
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  if (!token || !user) {
    return (
      <View style={[styles.center, { paddingTop: topInset + 20, paddingBottom: bottomInset + 20 }]}>
        <StatusBar style="dark" backgroundColor="#f8fafc" translucent />
        <View style={styles.card}>
          <Text style={styles.loginTitle}>Lacak HP</Text>

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={loginUser}
            onChangeText={(t) => setLoginUser(t.toLowerCase().replace(/[^a-z]/g, ""))}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="admin"
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={loginPass}
            onChangeText={setLoginPass}
            secureTextEntry
            placeholder="••••••"
            placeholderTextColor="#94a3b8"
          />

          {loginErr ? <Text style={styles.err}>{loginErr}</Text> : null}

          <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={busy}>
            <Text style={styles.btnPrimaryText}>{busy ? "Masuk..." : "Masuk"}</Text>
          </TouchableOpacity>
        </View>
        {batteryModal}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="transparent" translucent />

      <View style={styles.mapWrap}>
        <WebView
          ref={webRef}
          style={{ flex: 1 }}
          originWhitelist={["*"]}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mixedContentMode="always"
          source={{ html: MAP_HTML, baseUrl: SERVER_URL }}
          onLoadEnd={() => {
            setMapReady(true);
            webRef.current?.injectJavaScript(`window.updateDevices(${JSON.stringify(devices)}); true;`);
          }}
          onMessage={(ev) => {
            try {
              const msg = JSON.parse(ev.nativeEvent.data);
              if (msg.type === "select") {
                const found = devices.find((d) => d.device_id === msg.device_id);
                if (found) focusDevice(found);
              } else if (msg.type === "picked" && typeof msg.lat === "number" && typeof msg.lng === "number") {
                setPlaceLat(msg.lat);
                setPlaceLng(msg.lng);
              }
            } catch {}
          }}
        />
        <TouchableOpacity
          style={styles.myLocFab}
          onPress={focusMyCurrentLocation}
          accessibilityLabel="Lokasi Saat Ini"
        >
          <Ionicons name="locate" size={22} color="#0284c7" />
        </TouchableOpacity>
      </View>

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.floatingHeader,
          {
            top: topInset + 6,
            opacity: topControlsOpacity,
            transform: [{ translateY: topControlsTranslateY }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.floatingUserCard}
          activeOpacity={0.8}
          onPress={checkManualUpdate}
        >
          <View style={[styles.dot, { backgroundColor: wsOnline ? "#16a34a" : "#dc2626" }]} />
          <Text style={styles.floatingUserText} numberOfLines={1}>
            {user.display_name || user.username}
          </Text>
        </TouchableOpacity>

        <View style={styles.floatingActions}>
          <TouchableOpacity
            style={[styles.floatingBtn, panelMode === "places" && styles.floatingBtnActive]}
            onPress={togglePlacesPanel}
            accessibilityLabel="Buat Lokasi"
          >
            <Ionicons
              name={panelMode === "places" ? "location" : "location-outline"}
              size={20}
              color={panelMode === "places" ? "#0284c7" : "#0f172a"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.floatingBtn, panelMode === "notifs" && styles.floatingBtnActive]}
            onPress={toggleNotifsPanel}
            accessibilityLabel="Notifikasi"
          >
            <Ionicons
              name={panelMode === "notifs" ? "notifications" : "notifications-outline"}
              size={20}
              color={panelMode === "notifs" ? "#0284c7" : "#0f172a"}
            />
            {unreadNotifs > 0 ? (
              <View style={styles.badgeCount}>
                <Text style={styles.badgeCountText}>{unreadNotifs > 9 ? "9+" : unreadNotifs}</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          {user.role === "admin" ? (
            <TouchableOpacity
              style={styles.floatingBtn}
              onPress={openAdmin}
              accessibilityLabel="Kelola User"
            >
              <Ionicons name="people-outline" size={20} color="#0f172a" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.floatingBtn, styles.floatingBtnDanger]}
            onPress={confirmLogout}
            accessibilityLabel="Keluar"
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {toastMsg ? (
        <View style={[styles.toastBar, { top: topInset + 54 }]}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      <Animated.View style={[styles.bottomSheet, { height: sheetHeight }]}>
        <View {...panResponder.panHandlers} style={styles.sheetHandleArea}>
          <View style={styles.sheetHandle} />
        </View>

      {panelMode === "places" ? (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <View style={styles.devCard}>
            <View style={styles.devHead}>
              <Text style={styles.title}>
                {editingPlaceId ? "Edit Lokasi" : "Buat Lokasi Baru"}
              </Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => setPanelMode("devices")}>
                <Text style={styles.btnSmallText}>Tutup</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.devMeta}>
              Ketuk peta atau geser pin kuning untuk menentukan titik lokasi.
            </Text>

            <Text style={styles.label}>Nama Lokasi (contoh: Rumah, Kantor)</Text>
            <TextInput
              style={styles.input}
              value={placeName}
              onChangeText={setPlaceName}
              placeholder="Rumah"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.label}>Radius Deteksi</Text>
            <View style={styles.devActions}>
              {RADIUS_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={placeRadius === r ? styles.chipPrimary : styles.chip}
                  onPress={() => setPlaceRadius(r)}
                >
                  <Text style={placeRadius === r ? styles.chipPrimaryText : styles.chipText}>
                    {r}m
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.chip} onPress={snapPlaceToMyGps}>
                <Text style={styles.chipText}>Pakai Lokasi Saya</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.row, { marginTop: 8 }]}>
              <Text style={[styles.devMeta, { flexShrink: 0 }]}>Custom Radius (meter):</Text>
              <TextInput
                style={[styles.input, { flex: 1, paddingVertical: 6, fontSize: 13 }]}
                keyboardType="numeric"
                value={String(placeRadius)}
                onChangeText={(t) => {
                  const num = parseInt(t.replace(/[^0-9]/g, ""), 10);
                  if (!Number.isNaN(num)) setPlaceRadius(num);
                  else if (t === "") setPlaceRadius(0);
                }}
                placeholder="misal 250"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <Text style={styles.devMeta}>
              Pin: {Number(placeLat).toFixed(6)}, {Number(placeLng).toFixed(6)}
            </Text>
            {placeErr ? <Text style={styles.err}>{placeErr}</Text> : null}

            <View style={[styles.row, { marginTop: 10 }]}>
              <TouchableOpacity style={[styles.btnPrimary, { flex: 1, marginTop: 0 }]} onPress={savePlace}>
                <Text style={styles.btnPrimaryText}>
                  {editingPlaceId ? "Simpan Perubahan" : "Simpan Lokasi"}
                </Text>
              </TouchableOpacity>
              {editingPlaceId ? (
                <TouchableOpacity
                  style={styles.btnSmall}
                  onPress={() => {
                    setEditingPlaceId(null);
                    setPlaceName("");
                  }}
                >
                  <Text style={styles.btnSmallText}>Batal</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {places.length > 0 ? (
            <View style={styles.devCard}>
              <Text style={styles.devName}>Lokasi Tersimpan ({places.length})</Text>
              {places.map((p) => (
                <View key={p.id} style={styles.userRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.devName}>{p.name}</Text>
                    <Text style={styles.devMeta}>Radius {p.radius}m</Text>
                  </View>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={styles.btnSmall}
                      onPress={() => {
                        focusDevice(p);
                        startEditPlace(p);
                      }}
                    >
                      <Text style={styles.btnSmallText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnSmall, styles.btnDanger]}
                      onPress={() => removePlace(p)}
                    >
                      <Text style={styles.btnDangerText}>Hapus</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : panelMode === "notifs" ? (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <View style={styles.devCard}>
            <View style={styles.devHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Notifikasi Lokasi</Text>
                <Text style={styles.devMeta}>Ketuk notifikasi untuk melihat rute perjalanan user.</Text>
              </View>
              <TouchableOpacity style={styles.btnSmall} onPress={() => setPanelMode("devices")}>
                <Text style={styles.btnSmallText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>

          {notifications.length === 0 ? (
            <Text style={styles.muted}>Belum ada notifikasi pergi/sampai.</Text>
          ) : (
            notifications.map((n) => {
              const hasCoords = typeof n.lat === "number" && typeof n.lng === "number";
              const tile = hasCoords ? osmMiniTile(n.lat, n.lng, 16) : null;
              return (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.devCard, styles.notifCard]}
                  onPress={() =>
                    openHistory(
                      {
                        device_id: n.device_id,
                        username: n.username,
                        display_name: n.display_name || n.username,
                      },
                      1
                    )
                  }
                >
                  <View style={styles.miniMapBox}>
                    {tile ? (
                      <>
                        <Image source={{ uri: tile.url }} style={styles.miniMapImg} />
                        <View
                          style={[
                            styles.miniMapPin,
                            {
                              left: `${tile.px}%`,
                              top: `${tile.py}%`,
                              backgroundColor: n.color || "#0284c7",
                            },
                          ]}
                        />
                      </>
                    ) : (
                      <Ionicons name="location" size={24} color="#0284c7" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.devName}>{n.message}</Text>
                    <Text style={styles.devMeta}>
                      {formatAgo(n.created_at)} · Lihat rute perjalanan →
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      ) : panelMode === "history" && historyTarget ? (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <View style={styles.devCard}>
            <View style={styles.devHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  History · {historyTarget.display_name || historyTarget.username}
                </Text>
                <Text style={styles.devMeta}>
                  Total perjalanan: {historyData ? `${historyData.total_distance_km} km` : "..."}
                </Text>
              </View>
              <TouchableOpacity style={styles.btnSmall} onPress={closeHistory}>
                <Text style={styles.btnSmallText}>Tutup</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.devActions}>
              {[1, 3, 7].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={historyDays === d ? styles.chipGreen : styles.chip}
                  onPress={() => openHistory(historyTarget, d)}
                >
                  <Text style={historyDays === d ? styles.chipPrimaryText : styles.chipText}>
                    {d === 1 ? "24 Jam" : `${d} Hari`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {historyLoading ? (
            <Text style={styles.muted}>Memuat riwayat perjalanan...</Text>
          ) : !historyData || !historyData.segments || historyData.segments.length === 0 ? (
            <Text style={styles.muted}>Belum ada rekaman perjalanan pada rentang waktu ini.</Text>
          ) : (
            historyData.segments.map((seg, idx) => {
              const segCoord = seg.type === "stay"
                ? { lat: seg.lat, lng: seg.lng }
                : { lat: seg.end_lat, lng: seg.end_lng };
              const tile = osmMiniTile(segCoord.lat, segCoord.lng, 16);
              return (
                <TouchableOpacity
                  key={`${seg.type}-${seg.start_at}-${idx}`}
                  style={[styles.devCard, seg.type === "trip" && styles.tripCard, { flexDirection: "row", gap: 10, alignItems: "center" }]}
                  onPress={() => focusHistorySegment(seg)}
                >
                  <View style={styles.miniMapBox}>
                    <Image source={{ uri: tile.url }} style={styles.miniMapImg} />
                    <View
                      style={[
                        styles.miniMapPin,
                        {
                          left: `${tile.px}%`,
                          top: `${tile.py}%`,
                          backgroundColor: seg.type === "stay" ? "#0284c7" : "#16a34a",
                        },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    {seg.type === "stay" ? (
                      <>
                        <View style={styles.devHead}>
                          <Text style={styles.devName}>{seg.label}</Text>
                          <View style={styles.badgeStay}>
                            <Text style={styles.badgeTextLight}>SINGGAH</Text>
                          </View>
                        </View>
                        <Text style={styles.devMeta}>
                          {formatClock(seg.start_at)} – {formatClock(seg.end_at)} · {formatDuration(seg.duration_min)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={styles.devHead}>
                          <Text style={styles.tripTitle}>
                            Jalan · {seg.distance_km} km
                          </Text>
                          <View style={styles.badgeTrip}>
                            <Text style={styles.badgeTextLight}>{formatDuration(seg.duration_min)}</Text>
                          </View>
                        </View>
                        <Text style={styles.devMeta}>
                          {formatClock(seg.start_at)} – {formatClock(seg.end_at)}
                        </Text>
                        <Text style={styles.tripRoute}>Dari: {seg.from_label}</Text>
                        <Text style={styles.tripRoute}>Ke: {seg.to_label}</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 12, gap: 10 }}>
          {devices.length === 0 ? (
            <Text style={styles.muted}>
              Belum ada perangkat Android/iOS aktif. Ketuk tombol target di kanan bawah peta untuk update GPS.
            </Text>
          ) : (
            devices.map((d) => {
              const online = Date.now() - (d.last_seen || d.updated_at) < 90000;
              const bat = d.battery != null ? `${Math.round(d.battery)}%${d.charging ? " ⚡" : ""}` : "-";
              const acc = d.accuracy != null ? `${Math.round(d.accuracy)}m` : "-";
              const pLabel = d.platform === "ios" ? "iOS" : "Android";
              const isRinging = Boolean(ringingTargets[d.device_id]);
              return (
                <View key={d.device_id} style={styles.devCard}>
                  <View style={styles.devHead}>
                    <View style={styles.row}>
                      {d.photo ? (
                        <Image
                          source={{ uri: d.photo }}
                          style={[styles.userAvatarSmall, { borderColor: d.color || "#0284c7" }]}
                        />
                      ) : (
                        <View style={[styles.userColorDot, { backgroundColor: d.color || "#0284c7" }]} />
                      )}
                      <Text style={styles.devName}>{d.display_name || d.username}</Text>
                    </View>
                    <View style={[styles.badge, d.platform === "ios" ? styles.badgeIos : styles.badgeAnd]}>
                      <Text style={d.platform === "ios" ? styles.badgeIosText : styles.badgeAndText}>{pLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.devMeta}>
                    {d.device_name}
                    {d.current_place ? ` · Di ${d.current_place}` : ""}
                  </Text>
                  <Text style={styles.devMeta}>
                    {online ? "● Online" : "○ Offline"} · {formatAgo(d.updated_at)} · Baterai {bat} · Akurasi {acc}
                  </Text>
                  <View style={styles.devActions}>
                    <TouchableOpacity style={styles.chipPrimary} onPress={() => focusDevice(d)}>
                      <Text style={styles.chipPrimaryText}>Fokus</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chip} onPress={() => openRoute(d)}>
                      <Text style={styles.chipText}>Rute</Text>
                    </TouchableOpacity>
                    {isRinging ? (
                      <TouchableOpacity style={styles.chipDanger} onPress={() => stopPingDevice(d.device_id)}>
                        <Text style={styles.chipPrimaryText}>Hentikan</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.chip} onPress={() => pingDevice(d.device_id)}>
                        <Text style={styles.chipText}>Bunyikan</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.chipGreen} onPress={() => openHistory(d, 1)}>
                      <Text style={styles.chipPrimaryText}>History</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
      </Animated.View>

      <Modal visible={adminOpen} animationType="slide" onRequestClose={() => setAdminOpen(false)}>
        <View style={styles.fullPage}>
          <StatusBar style="dark" backgroundColor="#ffffff" translucent />
          <View style={[styles.header, { paddingTop: topInset + 4, paddingBottom: 6 }]}>
            <View style={styles.row}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setAdminOpen(false)}>
                <Ionicons name="arrow-back" size={20} color="#0f172a" />
              </TouchableOpacity>
              <Text style={styles.title}>
                {editingUsername ? `Edit @${editingUsername}` : "Kelola User"}
              </Text>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: bottomInset + 16, gap: 12 }}>
            <View style={styles.devCard}>
              <Text style={styles.devName}>
                {editingUsername ? `Edit Data @${editingUsername}` : "Tambah User Baru"}
              </Text>

              <View style={[styles.row, { marginTop: 12, alignItems: "center", gap: 12 }]}>
                {formPhoto ? (
                  <Image source={{ uri: formPhoto }} style={styles.avatarPreview} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: "#e2e8f0" }]}>
                    <Ionicons name="person" size={28} color="#64748b" />
                  </View>
                )}
                <View style={{ flex: 1, gap: 6 }}>
                  <TouchableOpacity style={styles.btnSmall} onPress={pickUserPhoto}>
                    <Text style={styles.btnSmallText}>
                      {formPhoto ? "Ganti / Timpa Foto" : "Upload Foto"}
                    </Text>
                  </TouchableOpacity>
                  {formPhoto ? (
                    <TouchableOpacity style={[styles.btnSmall, styles.btnDanger]} onPress={deleteFormPhoto}>
                      <Text style={styles.btnDangerText}>Hapus Foto</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <Text style={styles.label}>Username (huruf saja)</Text>
              <TextInput
                style={styles.input}
                value={formUsername}
                onChangeText={(t) => setFormUsername(t.toLowerCase().replace(/[^a-z]/g, ""))}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="lucky"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.label}>Nama (tampil di peta &amp; notifikasi)</Text>
              <TextInput
                style={styles.input}
                value={formDisplayName}
                onChangeText={setFormDisplayName}
                placeholder="Lucky Frediyanto"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.label}>
                {editingUsername ? "Password Baru (kosongkan jika tetap)" : "Password (bebas)"}
              </Text>
              <TextInput
                style={styles.input}
                value={formPassword}
                onChangeText={setFormPassword}
                secureTextEntry
                placeholder="••••••"
                placeholderTextColor="#94a3b8"
              />

              {editingUsername !== user.username ? (
                <View style={[styles.row, { marginTop: 10, justifyContent: "space-between" }]}>
                  <Text style={styles.muted}>Jadikan Admin?</Text>
                  <Switch value={formRole === "admin"} onValueChange={(v) => setFormRole(v ? "admin" : "user")} />
                </View>
              ) : null}

              {adminErr ? <Text style={styles.err}>{adminErr}</Text> : null}

              <View style={[styles.row, { marginTop: 14 }]}>
                <TouchableOpacity style={[styles.btnPrimary, { flex: 1, marginTop: 0 }]} onPress={saveUserForm}>
                  <Text style={styles.btnPrimaryText}>
                    {editingUsername ? "Simpan Perubahan" : "Tambah User"}
                  </Text>
                </TouchableOpacity>
                {editingUsername ? (
                  <TouchableOpacity style={styles.btnSmall} onPress={resetUserForm}>
                    <Text style={styles.btnSmallText}>Batal</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.devCard}>
              <Text style={[styles.devName, { marginBottom: 6 }]}>
                Daftar User ({usersList.length})
              </Text>
              {usersList.map((u) => (
                <View key={u.username} style={styles.userRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.row}>
                      {u.photo ? (
                        <Image
                          source={{ uri: u.photo }}
                          style={[styles.userAvatarSmall, { borderColor: u.color || "#0284c7" }]}
                        />
                      ) : (
                        <View style={[styles.userColorDot, { backgroundColor: u.color || "#0284c7" }]} />
                      )}
                      <Text style={styles.devName}>{u.display_name || u.username}</Text>
                    </View>
                    <Text style={styles.devMeta}>
                      @{u.username} · {u.role}{u.logged_in ? " · aktif" : ""}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <TouchableOpacity style={styles.btnSmall} onPress={() => startEditUser(u)}>
                      <Text style={styles.btnSmallText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnWarn} onPress={() => logoutUserByAdmin(u.username)}>
                      <Text style={styles.btnWarnText}>Logout</Text>
                    </TouchableOpacity>
                    {u.username !== user.username ? (
                      <TouchableOpacity style={[styles.btnSmall, styles.btnDanger]} onPress={() => deleteUser(u.username)}>
                        <Text style={styles.btnDangerText}>Hapus</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={Boolean(ringCaller)} animationType="fade" transparent>
        <View style={styles.alarmBg}>
          <View style={styles.alarmCard}>
            <Ionicons name="volume-high" size={44} color="#dc2626" />
            <Text style={styles.alarmTitle}>HP SEDANG DIBUNYIKAN</Text>
            <Text style={styles.alarmSub}>
              Oleh {ringCaller} · Volume 100% (maks 30 detik)
            </Text>
            <TouchableOpacity
              style={styles.alarmStopBtn}
              onPress={async () => {
                await stopLoudRing();
                setRingCaller(null);
              }}
            >
              <Text style={styles.alarmStopText}>Hentikan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={logoutModalOpen} animationType="fade" transparent>
        <View style={styles.modalBg}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="log-out-outline" size={28} color="#dc2626" />
            </View>
            <Text style={styles.confirmTitle}>Keluar dari Akun?</Text>
            <Text style={styles.confirmSub}>
              Pelacakan lokasi akan berhenti sementara sampai Anda masuk kembali.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setLogoutModalOpen(false)}
              >
                <Text style={styles.confirmCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmOkBtn} onPress={handleLogout}>
                <Text style={styles.confirmOkText}>Ya, Keluar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {batteryModal}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  fullPage: { flex: 1, backgroundColor: "#f8fafc" },
  loadingScreen: { flex: 1, backgroundColor: "#f8fafc", justifyContent: "center", alignItems: "center" },
  center: { flex: 1, backgroundColor: "#f8fafc", justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  loginTitle: { color: "#0f172a", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  title: { color: "#0f172a", fontSize: 17, fontWeight: "700" },
  label: { color: "#475569", fontSize: 12, fontWeight: "600", marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: "#ffffff",
    color: "#0f172a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  err: { color: "#dc2626", fontSize: 12, marginTop: 8 },
  btnPrimary: { backgroundColor: "#0284c7", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  btnPrimaryText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  header: {
    minHeight: 54,
    paddingBottom: 10,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  floatingHeader: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    zIndex: 20,
  },
  floatingUserCard: {
    flexShrink: 1,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  floatingUserText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 14,
    maxWidth: 160,
  },
  floatingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  floatingBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
    position: "relative",
  },
  floatingBtnActive: { backgroundColor: "#e0f2fe", borderColor: "#38bdf8" },
  floatingBtnDanger: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },
  headerTitle: { color: "#0f172a", fontWeight: "700", fontSize: 15, maxWidth: 150 },
  row: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconBtnActive: { backgroundColor: "#e0f2fe", borderColor: "#38bdf8" },
  iconBtnDanger: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },
  badgeCount: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeCountText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  btnSmall: { backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  btnSmallText: { color: "#0f172a", fontSize: 12, fontWeight: "600" },
  btnDanger: { backgroundColor: "#dc2626", borderColor: "#dc2626" },
  btnDangerText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  toastBar: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toastText: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  mapWrap: { flex: 1, backgroundColor: "#e2e8f0", position: "relative" },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
    overflow: "hidden",
  },
  sheetHandleArea: {
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
  },
  avatarPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#0284c7",
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
  },
  myLocFab: {
    position: "absolute",
    right: 12,
    bottom: 90,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 10,
  },
  list: { flex: 1, backgroundColor: "#f8fafc" },
  devCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  devHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  devName: { color: "#0f172a", fontSize: 14, fontWeight: "700" },
  devMeta: { color: "#64748b", fontSize: 12, marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeIos: { backgroundColor: "#dbeafe" },
  badgeIosText: { color: "#1d4ed8", fontSize: 10, fontWeight: "700" },
  badgeAnd: { backgroundColor: "#dcfce7" },
  badgeAndText: { color: "#15803d", fontSize: 10, fontWeight: "700" },
  badgeTextLight: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  devActions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chipPrimary: { backgroundColor: "#0284c7", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipGreen: { backgroundColor: "#16a34a", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipDanger: { backgroundColor: "#dc2626", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipPrimaryText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  chip: { backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipText: { color: "#0f172a", fontSize: 12, fontWeight: "600" },
  tripCard: { borderColor: "#22c55e", backgroundColor: "#f0fdf4" },
  tripTitle: { color: "#15803d", fontSize: 14, fontWeight: "700" },
  tripRoute: { color: "#1e293b", fontSize: 12, marginTop: 2 },
  badgeStay: { backgroundColor: "#0284c7", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeTrip: { backgroundColor: "#16a34a", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  notifCard: { flexDirection: "row", alignItems: "center", gap: 10 },
  miniMapBox: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  miniMapImg: { width: "100%", height: "100%" },
  miniMapPin: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#ffffff",
    position: "absolute",
    marginLeft: -6.5,
    marginTop: -6.5,
  },
  userColorDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: "#ffffff" },
  btnWarn: { backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fcd34d", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  btnWarnText: { color: "#92400e", fontSize: 11, fontWeight: "700" },
  muted: { color: "#64748b", fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e2e8f0" },
  alarmBg: { flex: 1, backgroundColor: "rgba(153, 27, 27, 0.88)", justifyContent: "center", padding: 24 },
  alarmCard: { backgroundColor: "#ffffff", borderRadius: 20, padding: 24, borderWidth: 2, borderColor: "#dc2626", alignItems: "center" },
  alarmTitle: { color: "#dc2626", fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 8 },
  alarmSub: { color: "#334155", fontSize: 13, marginTop: 6, textAlign: "center" },
  alarmStopBtn: { backgroundColor: "#dc2626", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, marginTop: 18, width: "100%", alignItems: "center" },
  alarmStopText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  confirmCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confirmTitle: { color: "#0f172a", fontSize: 18, fontWeight: "700", textAlign: "center" },
  confirmSub: { color: "#64748b", fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 18, width: "100%" },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmCancelText: { color: "#0f172a", fontSize: 14, fontWeight: "700" },
  confirmOkBtn: {
    flex: 1,
    backgroundColor: "#dc2626",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmOkText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
});
