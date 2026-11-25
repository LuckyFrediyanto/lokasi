const { withAndroidManifest, withMainApplication, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const JAVA_SOURCE = `package com.pribadi.lacakhp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;

public class PersistentLocationService extends Service {
  private static final String CHANNEL_ID = "lacak-persistent";

  @Override public void onCreate() {
    super.onCreate();
    createChannel();
    Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
      ? new Notification.Builder(this, CHANNEL_ID)
      : new Notification.Builder(this);
    Notification notification = builder
      .setContentTitle("Lacak HP aktif")
      .setContentText("Pelacakan latar belakang tetap berjalan")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .build();
    startForeground(901, notification);
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID, "Lacak HP Background", NotificationManager.IMPORTANCE_LOW
      );
      channel.setDescription("Service pelacakan lokasi dan alarm");
      NotificationManager manager = getSystemService(NotificationManager.class);
      if (manager != null) manager.createNotificationChannel(channel);
    }
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    return START_STICKY;
  }

  @Override public void onTaskRemoved(Intent rootIntent) {
    Intent restart = new Intent(getApplicationContext(), PersistentLocationService.class);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForegroundService(restart);
    } else {
      startService(restart);
    }
    super.onTaskRemoved(rootIntent);
  }

  @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
`;

module.exports = function withPersistentLocationService(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) {
      app.service = app.service || [];
      if (!app.service.some((s) => s.$?.["android:name"] === ".PersistentLocationService")) {
        app.service.push({
          $: {
            "android:name": ".PersistentLocationService",
            "android:exported": "false",
            "android:foregroundServiceType": "location|dataSync",
            "android:stopWithTask": "false",
          },
        });
      }
    }
    return mod;
  });

  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const root = mod.modRequest.platformProjectRoot;
      const targetDir = path.join(root, "app", "src", "main", "java", "com", "pribadi", "lacakhp");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "PersistentLocationService.java"), JAVA_SOURCE, "utf8");
      return mod;
    },
  ]);

  return withMainApplication(config, (mod) => {
    const app = mod.modResults;
    if (!app.contents.includes("PersistentLocationService")) {
      app.contents = app.contents.replace(
        "import android.app.Application;",
        "import android.app.Application;\nimport android.content.Intent;\nimport android.os.Build;\nimport com.pribadi.lacakhp.PersistentLocationService;"
      );
      app.contents = app.contents.replace(
        "super.onCreate();",
        "super.onCreate();\n    try {\n      Intent serviceIntent = new Intent(this, PersistentLocationService.class);\n      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(serviceIntent); else startService(serviceIntent);\n    } catch (Exception ignored) {}"
      );
    }
    return mod;
  });
};
