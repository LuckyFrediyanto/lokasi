import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import * as Notifications from "expo-notifications";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { toWsUrl } from "./src/config";
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

const RADIUS_OPTIONS = [20, 50, 100, 200];

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

async function setupNotifications() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("lokasi-alerts", {
        name: "Notifikasi Lokasi",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 200, 250],
      });
    }
    await Notifications.requestPermissionsAsync();
  } catch {}
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

  const [trailId, setTrailId] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [tick, setTick] = useState(0);

  const [placeMode, setPlaceMode] = useState(false);
  const [editingPlaceId, setEditingPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState("");
  const [placeRadius, setPlaceRadius] = useState(50);
  const [placeLat, setPlaceLat] = useState(-6.8048);
  const [placeLng, setPlaceLng] = useState(110.8405);
  const [placeErr, setPlaceErr] = useState("");

  const [notifOpen, setNotifOpen] = useState(false);

  const [adminOpen, setAdminOpen] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [editingUsername, setEditingUsername] = useState(null);
  const [formUsername, setFormUsername] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("user");
  const [adminErr, setAdminErr] = useState("");

  const webRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const toastTimer = useRef(null);
  const watchSubRef = useRef(null);

  function showToast(text) {
    setToastMsg(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 6000);
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
      const [sess, devId, active] = await Promise.all([
        getSession(),
        getOrCreateDeviceId(),
        isBackgroundTrackingActive(),
      ]);
      setMyDeviceId(devId);
      setBgActive(active);
      if (sess.token) {
        try {
          const res = await apiRequest("/api/auth/me", { token: sess.token });
          setToken(sess.token);
          setUser(res.user);
          setupNotifications();
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
    webRef.current.injectJavaScript(`window.updatePlaces(${JSON.stringify(places)}); true;`);
  }, [places, mapReady]);

  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    if (placeMode) {
      webRef.current.injectJavaScript(
        `window.setPickMode(true, ${Number(placeLat)}, ${Number(placeLng)}, ${Number(placeRadius)}); true;`
      );
    } else {
      webRef.current.injectJavaScript("window.setPickMode(false); true;");
    }
  }, [placeMode, placeLat, placeLng, placeRadius, mapReady]);

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
          } else if (msg.type === "places" && Array.isArray(msg.places)) {
            setPlaces(msg.places);
          } else if (msg.type === "notification" && msg.notification) {
            setNotifications((prev) => [msg.notification, ...prev].slice(0, 50));
            setUnreadNotifs((n) => n + 1);
            showToast(msg.notification.message);
            showLocalOsNotification(msg.notification.message);
          } else if (msg.type === "ring") {
            const fullMyId = `${user.username}:${myDeviceId}`;
            if (msg.target_device_id === fullMyId || msg.target_username === user.username) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              Vibration.vibrate([0, 600, 200, 600, 200, 600]);
              const caller = msg.from_display_name || msg.from_username;
              Alert.alert("Panggilan Lacak HP", `Perangkat ini dibunyikan oleh ${caller}`);
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        setWsOnline(false);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
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

  async function handleLogin() {
    setLoginErr("");
    setBusy(true);
    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: { username: loginUser.trim().toLowerCase(), password: loginPass },
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

  async function handleLogout() {
    try {
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }
      await stopBackgroundTracking();
      if (token) {
        await apiRequest("/api/auth/logout", {
          method: "POST",
          token,
          body: { device_id: myDeviceId },
        });
      }
    } catch {}
    await clearSession();
    setBgActive(false);
    setPlaceMode(false);
    setToken(null);
    setUser(null);
    setDevices([]);
    setPlaces([]);
    setNotifications([]);
  }

  async function toggleBackground(val) {
    if (val) {
      const res = await startBackgroundTracking();
      setBgActive(res.ok);
      if (!res.ok) Alert.alert("Izin Latar Belakang", res.reason);
      else sendCurrentLocationNow().catch(() => {});
    } else {
      await stopBackgroundTracking();
      setBgActive(false);
    }
  }

  async function handleSendNow() {
    try {
      await sendCurrentLocationNow();
      showToast("Lokasi diperbarui");
    } catch (e) {
      Alert.alert("GPS", e.message || "Gagal ambil lokasi");
    }
  }

  function focusDevice(d) {
    if (webRef.current) {
      webRef.current.injectJavaScript(`window.focusDevice(${d.lat}, ${d.lng}); true;`);
    }
  }

  async function toggleTrail(deviceId) {
    if (trailId === deviceId) {
      setTrailId(null);
      webRef.current?.injectJavaScript("window.setTrail([]); true;");
      return;
    }
    try {
      const data = await apiRequest(`/api/locations/${encodeURIComponent(deviceId)}/history`, { token });
      setTrailId(deviceId);
      webRef.current?.injectJavaScript(`window.setTrail(${JSON.stringify(data.points || [])}); true;`);
    } catch (e) {
      Alert.alert("Riwayat", e.message);
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
      showToast("Sinyal bunyikan dikirim");
    } catch (e) {
      Alert.alert("Gagal", e.message);
    }
  }

  async function openCreatePlace() {
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
    setPlaceMode(true);
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
    setFormRole(u.role);
    setAdminErr("");
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

  if (booting) {
    return (
      <View style={[styles.center, { paddingTop: topInset + 20, paddingBottom: bottomInset + 20 }]}>
        <StatusBar style="light" backgroundColor="#0f172a" translucent />
        <Text style={styles.muted}>Memuat...</Text>
      </View>
    );
  }

  if (!token || !user) {
    return (
      <View style={[styles.center, { paddingTop: topInset + 20, paddingBottom: bottomInset + 20 }]}>
        <StatusBar style="light" backgroundColor="#0f172a" translucent />
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
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={loginPass}
            onChangeText={setLoginPass}
            secureTextEntry
            placeholder="••••••"
            placeholderTextColor="#64748b"
          />

          {loginErr ? <Text style={styles.err}>{loginErr}</Text> : null}

          <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={busy}>
            <Text style={styles.btnPrimaryText}>{busy ? "Masuk..." : "Masuk"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <StatusBar style="light" backgroundColor="#1e293b" translucent />
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <View style={[styles.row, { flexShrink: 1 }]}>
          <View style={[styles.dot, { backgroundColor: wsOnline ? "#22c55e" : "#ef4444" }]} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {user.display_name || user.username}
          </Text>
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btnSmall, placeMode && styles.btnAccent]}
            onPress={() => (placeMode ? setPlaceMode(false) : openCreatePlace())}
          >
            <Text style={placeMode ? styles.btnAccentText : styles.btnSmallText}>
              {placeMode ? "Tutup" : "Buat Lokasi"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnSmall}
            onPress={() => {
              setUnreadNotifs(0);
              setNotifOpen(true);
            }}
          >
            <Text style={styles.btnSmallText}>
              Notif{unreadNotifs > 0 ? ` (${unreadNotifs})` : ""}
            </Text>
          </TouchableOpacity>
          {user.role === "admin" ? (
            <TouchableOpacity style={styles.btnSmall} onPress={openAdmin}>
              <Text style={styles.btnSmallText}>User</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.btnSmall, styles.btnDanger]} onPress={handleLogout}>
            <Text style={styles.btnDangerText}>Keluar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {toastMsg ? (
        <View style={styles.toastBar}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      <View style={styles.bgBar}>
        <Text style={styles.bgText}>
          Lacak Latar Belakang ({bgActive ? "AKTIF" : "NONAKTIF"})
        </Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.miniBtn} onPress={handleSendNow}>
            <Text style={styles.miniBtnText}>Update GPS</Text>
          </TouchableOpacity>
          <Switch value={bgActive} onValueChange={toggleBackground} />
        </View>
      </View>

      <View style={styles.mapWrap}>
        <WebView
          ref={webRef}
          source={{ html: MAP_HTML }}
          onLoadEnd={() => setMapReady(true)}
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
      </View>

      {placeMode ? (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <View style={styles.devCard}>
            <Text style={styles.title}>
              {editingPlaceId ? "Edit Lokasi" : "Buat Lokasi Baru"}
            </Text>
            <Text style={styles.devMeta}>
              Ketuk peta atau geser pin kuning untuk menentukan titik lokasi.
            </Text>

            <Text style={styles.label}>Nama Lokasi (contoh: Rumah, Kantor)</Text>
            <TextInput
              style={styles.input}
              value={placeName}
              onChangeText={setPlaceName}
              placeholder="Rumah"
              placeholderTextColor="#64748b"
            />

            <Text style={styles.label}>Radius Deteksi (disarankan 50m / 100m)</Text>
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
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 12, gap: 10 }}>
          {devices.length === 0 ? (
            <Text style={styles.muted}>
              Belum ada perangkat Android/iOS aktif. Tekan "Update GPS" atau tunggu GPS terkunci.
            </Text>
          ) : (
            devices.map((d) => {
              const online = Date.now() - (d.last_seen || d.updated_at) < 90000;
              const bat = d.battery != null ? `${Math.round(d.battery)}%${d.charging ? " ⚡" : ""}` : "-";
              const acc = d.accuracy != null ? `${Math.round(d.accuracy)}m` : "-";
              const pLabel = d.platform === "ios" ? "iOS" : "Android";
              return (
                <View key={d.device_id} style={styles.devCard}>
                  <View style={styles.devHead}>
                    <Text style={styles.devName}>{d.display_name || d.username}</Text>
                    <View style={[styles.badge, d.platform === "ios" ? styles.badgeIos : styles.badgeAnd]}>
                      <Text style={styles.badgeText}>{pLabel}</Text>
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
                    <TouchableOpacity style={styles.chip} onPress={() => toggleTrail(d.device_id)}>
                      <Text style={styles.chipText}>{trailId === d.device_id ? "Tutup Jejak" : "Jejak"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chip} onPress={() => openRoute(d)}>
                      <Text style={styles.chipText}>Rute</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chip} onPress={() => pingDevice(d.device_id)}>
                      <Text style={styles.chipText}>Bunyikan</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={notifOpen} animationType="slide" transparent>
        <View style={[styles.modalBg, { paddingTop: topInset + 16, paddingBottom: bottomInset + 16 }]}>
          <View style={styles.modalCard}>
            <View style={styles.devHead}>
              <Text style={styles.title}>Notifikasi Lokasi</Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => setNotifOpen(false)}>
                <Text style={styles.btnSmallText}>Tutup</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380, marginTop: 10 }}>
              {notifications.length === 0 ? (
                <Text style={styles.muted}>Belum ada notifikasi pergi/sampai.</Text>
              ) : (
                notifications.map((n) => (
                  <View key={n.id} style={styles.userRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.devName}>{n.message}</Text>
                      <Text style={styles.devMeta}>{formatAgo(n.created_at)}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={adminOpen} animationType="slide" transparent>
        <View style={[styles.modalBg, { paddingTop: topInset + 16, paddingBottom: bottomInset + 16 }]}>
          <View style={styles.modalCard}>
            <View style={styles.devHead}>
              <Text style={styles.title}>
                {editingUsername ? `Edit @${editingUsername}` : "Kelola User"}
              </Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => setAdminOpen(false)}>
                <Text style={styles.btnSmallText}>Tutup</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Username (huruf saja)</Text>
            <TextInput
              style={styles.input}
              value={formUsername}
              onChangeText={(t) => setFormUsername(t.toLowerCase().replace(/[^a-z]/g, ""))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="lucky"
              placeholderTextColor="#64748b"
            />

            <Text style={styles.label}>Nama (tampil di peta &amp; notifikasi)</Text>
            <TextInput
              style={styles.input}
              value={formDisplayName}
              onChangeText={setFormDisplayName}
              placeholder="Lucky Frediyanto"
              placeholderTextColor="#64748b"
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
              placeholderTextColor="#64748b"
            />

            {editingUsername !== user.username ? (
              <View style={[styles.row, { marginTop: 10, justifyContent: "space-between" }]}>
                <Text style={styles.muted}>Jadikan Admin?</Text>
                <Switch value={formRole === "admin"} onValueChange={(v) => setFormRole(v ? "admin" : "user")} />
              </View>
            ) : null}

            {adminErr ? <Text style={styles.err}>{adminErr}</Text> : null}

            <View style={[styles.row, { marginTop: 12 }]}>
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

            <ScrollView style={{ maxHeight: 220, marginTop: 14 }}>
              {usersList.map((u) => (
                <View key={u.username} style={styles.userRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.devName}>{u.display_name || u.username}</Text>
                    <Text style={styles.devMeta}>@{u.username} · {u.role}</Text>
                  </View>
                  <View style={styles.row}>
                    <TouchableOpacity style={styles.btnSmall} onPress={() => startEditUser(u)}>
                      <Text style={styles.btnSmallText}>Edit</Text>
                    </TouchableOpacity>
                    {u.username !== user.username ? (
                      <TouchableOpacity style={[styles.btnSmall, styles.btnDanger]} onPress={() => deleteUser(u.username)}>
                        <Text style={styles.btnDangerText}>Hapus</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  container: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#334155" },
  loginTitle: { color: "#f8fafc", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  title: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  label: { color: "#94a3b8", fontSize: 12, marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: "#0b1220",
    color: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  err: { color: "#fca5a5", fontSize: 12, marginTop: 8 },
  btnPrimary: { backgroundColor: "#38bdf8", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  btnPrimaryText: { color: "#0b1220", fontWeight: "700", fontSize: 14 },
  header: {
    minHeight: 54,
    paddingBottom: 10,
    backgroundColor: "#1e293b",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  headerTitle: { color: "#f8fafc", fontWeight: "700", fontSize: 14, maxWidth: 120 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  btnSmall: { backgroundColor: "#334155", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  btnSmallText: { color: "#f8fafc", fontSize: 11, fontWeight: "600" },
  btnAccent: { backgroundColor: "#38bdf8" },
  btnAccentText: { color: "#0b1220", fontSize: 11, fontWeight: "700" },
  btnDanger: { backgroundColor: "#ef4444" },
  btnDangerText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  toastBar: {
    backgroundColor: "#0c4a6e",
    borderBottomWidth: 1,
    borderBottomColor: "#38bdf8",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toastText: { color: "#f8fafc", fontSize: 12, fontWeight: "700" },
  bgBar: {
    backgroundColor: "#162033",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bgText: { color: "#cbd5e1", fontSize: 11, fontWeight: "600" },
  miniBtn: { backgroundColor: "#334155", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7 },
  miniBtnText: { color: "#e2e8f0", fontSize: 11, fontWeight: "600" },
  mapWrap: { flex: 1.15, backgroundColor: "#0b1220" },
  list: { flex: 0.85, backgroundColor: "#0f172a", borderTopWidth: 1, borderTopColor: "#334155" },
  devCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#334155" },
  devHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  devName: { color: "#f8fafc", fontSize: 14, fontWeight: "700" },
  devMeta: { color: "#94a3b8", fontSize: 12, marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeIos: { backgroundColor: "#1d4ed8" },
  badgeAnd: { backgroundColor: "#15803d" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  devActions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chipPrimary: { backgroundColor: "#38bdf8", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipPrimaryText: { color: "#0b1220", fontSize: 12, fontWeight: "700" },
  chip: { backgroundColor: "#334155", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipText: { color: "#f8fafc", fontSize: 12, fontWeight: "600" },
  muted: { color: "#94a3b8", fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334155" },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
});
