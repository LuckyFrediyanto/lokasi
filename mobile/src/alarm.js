import { Platform, Vibration } from "react-native";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import { VolumeManager, RINGER_MODE } from "react-native-volume-manager";

const MAX_RING_MS = 30000;

let activeSound = null;
let hapticTimer = null;
let autoStopTimer = null;
let activeNotifId = null;

async function forceMaxVolume() {
  try {
    if (Platform.OS === "android") {
      try {
        await VolumeManager.setRingerMode(RINGER_MODE?.normal ?? 2);
      } catch {}
      await VolumeManager.setVolume(1.0, { type: "music", showUI: false });
      await VolumeManager.setVolume(1.0, { type: "alarm", showUI: false });
      await VolumeManager.setVolume(1.0, { type: "ring", showUI: false });
    } else if (Platform.OS === "ios") {
      try {
        await VolumeManager.enableInSilenceMode(true);
      } catch {}
      await VolumeManager.setVolume(1.0, { showUI: false });
    }
  } catch {}
}

export async function startLoudRing(callerName, onAutoStop = null) {
  await stopLoudRing();
  await forceMaxVolume();

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      shouldDuckAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      require("../assets/alarm.wav"),
      { shouldPlay: true, isLooping: true, volume: 1.0 }
    );
    activeSound = sound;
    await sound.setVolumeAsync(1.0);
    await sound.playAsync();
  } catch {}

  try {
    Vibration.vibrate([0, 700, 300], true);
  } catch {}

  hapticTimer = setInterval(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, 1500);

  autoStopTimer = setTimeout(async () => {
    await stopLoudRing();
    if (typeof onAutoStop === "function") onAutoStop();
  }, MAX_RING_MS);

  try {
    activeNotifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Panggilan Lacak HP",
        body: `Perangkat ini dibunyikan oleh ${callerName}`,
        sound: "alarm.wav",
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === "android" ? { channelId: "alarm-ring" } : {}),
      },
      trigger: null,
    });
  } catch {}
}

export async function stopLoudRing() {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  if (hapticTimer) {
    clearInterval(hapticTimer);
    hapticTimer = null;
  }
  try {
    Vibration.cancel();
  } catch {}
  if (activeSound) {
    const s = activeSound;
    activeSound = null;
    try { await s.stopAsync(); } catch {}
    try { await s.unloadAsync(); } catch {}
  }
  if (activeNotifId) {
    const id = activeNotifId;
    activeNotifId = null;
    try { await Notifications.dismissNotificationAsync(id); } catch {}
  }
}
