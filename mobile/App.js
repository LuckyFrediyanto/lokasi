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
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { toWsUrl } from "./src/config";
import {
  apiRequest,
  clearSession,
  getOrCreateDeviceId,
  getSession,
  saveServerUrl,
  saveSession,
} from "./src/api";
import {
  isBackgroundTrackingActive,
  sendCurrentLocationNow,
  startBackgroundTracking,
  stopBackgroundTracking,
} from "./src/tracking";
import { MAP_HTML } from "./src/mapHtml";

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

function AppInner() {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? (RNStatusBar.currentHeight || 28) : 0
  );
  const bottomInset = insets.bottom;

  const [booting, setBooting] = useState(true);
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [myDeviceId, setMyDeviceId] = useState("");

  const [loginUser, setLoginUser] = useState("admin");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [wsOnline, setWsOnline] = useState(false);
  const [bgActive, setBgActive] = useState(false);
  const [devices, setDevices] = useState([]);
  const [trailId, setTrailId] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [tick, setTick] = useState(0);

  const [adminOpen, setAdminOpen] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [adminErr, setAdminErr] = useState("");

  const webRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

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
      setServerUrl(sess.serverUrl);
      setMyDeviceId(devId);
      setBgActive(active);
      if (sess.token && sess.serverUrl) {
        try {
          const res = await apiRequest(sess.serverUrl, "/api/auth/me", { token: sess.token });
          setToken(sess.token);
          setUser(res.user);
        } catch {
          await clearSession();
        }
      }
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    webRef.current.injectJavaScript(`window.updateDevices(${JSON.stringify(devices)}); true;`);
  }, [devices, mapReady, tick]);

  useEffect(() => {
    if (!token || !serverUrl || !user) return;
    let alive = true;
    let pingTimer = null;

    function upsert(dev) {
      setDevices((prev) => {
        const next = prev.filter((d) => d.device_id !== dev.device_id);
        next.push(dev);
        next.sort((a, b) => b.updated_at - a.updated_at);
        return next;
      });
    }

    function connect() {
      if (!alive) return;
      const ws = new WebSocket(toWsUrl(serverUrl, token));
      wsRef.current = ws;
      ws.onopen = () => {
        setWsOnline(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
        }, 30000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "snapshot" && Array.isArray(msg.devices)) {
            setDevices([...msg.devices].sort((a, b) => b.updated_at - a.updated_at));
          } else if (msg.type === "location" && msg.device) {
            upsert(msg.device);
          } else if (msg.type === "device_removed") {
            setDevices((prev) => prev.filter((d) => d.device_id !== msg.device_id));
          } else if (msg.type === "ring") {
            const fullMyId = `${user.username}:${myDeviceId}`;
            if (msg.target_device_id === fullMyId || msg.target_username === user.username) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              Vibration.vibrate([0, 600, 200, 600, 200, 600]);
              Alert.alert("Panggilan Lacak HP", `Perangkat ini dibunyikan oleh ${msg.from_username}`);
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        setWsOnline(false);
        if (pingTimer) clearInterval(pingTimer);
        if (alive) reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      alive = false;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
    };
  }, [token, serverUrl, user, myDeviceId]);

  async function handleLogin() {
    setLoginErr("");
    setBusy(true);
    try {
      const cleanUrl = await saveServerUrl(serverUrl);
      setServerUrl(cleanUrl);
      const data = await apiRequest(cleanUrl, "/api/auth/login", {
        method: "POST",
        body: { username: loginUser.trim(), password: loginPass },
      });
      await saveSession(data.token, data.user.username);
      setToken(data.token);
      setUser(data.user);
      setLoginPass("");

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
      await stopBackgroundTracking();
      if (token && serverUrl) {
        await apiRequest(serverUrl, "/api/auth/logout", { method: "POST", token });
      }
    } catch {}
    await clearSession();
    setBgActive(false);
    setToken(null);
    setUser(null);
    setDevices([]);
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
      const data = await apiRequest(serverUrl, `/api/locations/${encodeURIComponent(deviceId)}/history`, { token });
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
      await apiRequest(serverUrl, `/api/locations/${encodeURIComponent(deviceId)}/ping`, {
        method: "POST",
        token,
      });
      Alert.alert("Terkirim", "Sinyal bunyikan dikirim ke perangkat.");
    } catch (e) {
      Alert.alert("Gagal", e.message);
    }
  }

  async function openAdmin() {
    setAdminErr("");
    setAdminOpen(true);
    try {
      const data = await apiRequest(serverUrl, "/api/users", { token });
      setUsersList(data.users || []);
    } catch (e) {
      setAdminErr(e.message);
    }
  }

  async function createUser() {
    setAdminErr("");
    try {
      await apiRequest(serverUrl, "/api/users", {
        method: "POST",
        token,
        body: { username: newUsername.trim(), password: newPassword, role: newRole },
      });
      setNewUsername("");
      setNewPassword("");
      const data = await apiRequest(serverUrl, "/api/users", { token });
      setUsersList(data.users || []);
    } catch (e) {
      setAdminErr(e.message);
    }
  }

  async function deleteUser(uname) {
    Alert.alert("Hapus User", `Hapus akun ${uname}?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest(serverUrl, `/api/users/${encodeURIComponent(uname)}`, {
              method: "DELETE",
              token,
            });
            const data = await apiRequest(serverUrl, "/api/users", { token });
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
          <Text style={styles.title}>Lacak HP Realtime</Text>
          <Text style={styles.sub}>Gabungan iOS &amp; Android (Latar Belakang)</Text>

          <Text style={styles.label}>Server URL (Cloudflare Worker)</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://lacak-hp-server.xxx.workers.dev"
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={loginUser}
            onChangeText={setLoginUser}
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
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: wsOnline ? "#22c55e" : "#ef4444" }]} />
          <Text style={styles.headerTitle}>{user.username}</Text>
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btnSmall} onPress={handleSendNow}>
            <Text style={styles.btnSmallText}>Kirim GPS</Text>
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

      <View style={styles.bgBar}>
        <Text style={styles.bgText}>
          Lacak Latar Belakang ({bgActive ? "AKTIF" : "NONAKTIF"})
        </Text>
        <Switch value={bgActive} onValueChange={toggleBackground} />
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
              }
            } catch {}
          }}
        />
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ padding: 12, gap: 10 }}>
        {devices.length === 0 ? (
          <Text style={styles.muted}>Belum ada perangkat mengirim lokasi. Tekan "Kirim GPS".</Text>
        ) : (
          devices.map((d) => {
            const online = Date.now() - d.updated_at < 120000;
            const bat = d.battery != null ? `${Math.round(d.battery)}%${d.charging ? " ⚡" : ""}` : "-";
            const acc = d.accuracy != null ? `${Math.round(d.accuracy)}m` : "-";
            return (
              <View key={d.device_id} style={styles.devCard}>
                <View style={styles.devHead}>
                  <Text style={styles.devName}>{d.username}</Text>
                  <View style={[styles.badge, d.platform === "ios" ? styles.badgeIos : styles.badgeAnd]}>
                    <Text style={styles.badgeText}>{String(d.platform).toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.devMeta}>
                  {d.device_name} · {online ? "● Online" : "○"} {formatAgo(d.updated_at)}
                </Text>
                <Text style={styles.devMeta}>
                  Baterai {bat} · Akurasi {acc} · {d.lat.toFixed(5)}, {d.lng.toFixed(5)}
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

      <Modal visible={adminOpen} animationType="slide" transparent>
        <View style={[styles.modalBg, { paddingTop: topInset + 16, paddingBottom: bottomInset + 16 }]}>
          <View style={styles.modalCard}>
            <View style={styles.devHead}>
              <Text style={styles.title}>Kelola User</Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => setAdminOpen(false)}>
                <Text style={styles.btnSmallText}>Tutup</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Username Baru</Text>
            <TextInput
              style={styles.input}
              value={newUsername}
              onChangeText={setNewUsername}
              autoCapitalize="none"
              placeholder="iphone-saya"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Password (min 6 karakter)</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="••••••"
              placeholderTextColor="#64748b"
            />
            <View style={[styles.row, { marginTop: 10, justifyContent: "space-between" }]}>
              <Text style={styles.muted}>Jadikan Admin?</Text>
              <Switch value={newRole === "admin"} onValueChange={(v) => setNewRole(v ? "admin" : "user")} />
            </View>
            {adminErr ? <Text style={styles.err}>{adminErr}</Text> : null}
            <TouchableOpacity style={styles.btnPrimary} onPress={createUser}>
              <Text style={styles.btnPrimaryText}>Tambah User</Text>
            </TouchableOpacity>
            <ScrollView style={{ maxHeight: 220, marginTop: 14 }}>
              {usersList.map((u) => (
                <View key={u.username} style={styles.userRow}>
                  <Text style={styles.devName}>
                    {u.username} <Text style={styles.muted}>({u.role})</Text>
                  </Text>
                  {u.username !== user.username ? (
                    <TouchableOpacity style={[styles.btnSmall, styles.btnDanger]} onPress={() => deleteUser(u.username)}>
                      <Text style={styles.btnDangerText}>Hapus</Text>
                    </TouchableOpacity>
                  ) : null}
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
  title: { color: "#f8fafc", fontSize: 19, fontWeight: "700" },
  sub: { color: "#94a3b8", fontSize: 13, marginTop: 4, marginBottom: 12 },
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
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "#f8fafc", fontWeight: "700", fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  btnSmall: { backgroundColor: "#334155", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  btnSmallText: { color: "#f8fafc", fontSize: 12, fontWeight: "600" },
  btnDanger: { backgroundColor: "#ef4444" },
  btnDangerText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  bgBar: {
    backgroundColor: "#162033",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bgText: { color: "#cbd5e1", fontSize: 12, fontWeight: "600" },
  mapWrap: { flex: 1.15, backgroundColor: "#0b1220" },
  list: { flex: 0.85, backgroundColor: "#0f172a", borderTopWidth: 1, borderTopColor: "#334155" },
  devCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#334155" },
  devHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  devName: { color: "#f8fafc", fontSize: 15, fontWeight: "700" },
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
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 18 },
  modalCard: { backgroundColor: "#1e293b", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#334155" },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
});
