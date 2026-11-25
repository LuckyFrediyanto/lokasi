const { withAndroidManifest, withMainApplication, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withPersistentLocationService(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
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
    return mod;
  });

  config = withDangerousMod(config, ["android", async (mod) => {
    const root = mod.modRequest.platformProjectRoot;
    const src = path.join(root, "app", "src", "main", "java", "com", "pribadi", "lacakhp");
    fs.mkdirSync(src, { recursive: true });
    const source = path.join(__dirname, "..", "android", "src", "main", "java", "com", "pribadi", "lacakhp", "PersistentLocationService.java");
    fs.copyFileSync(source, path.join(src, "PersistentLocationService.java"));
    return mod;
  }]);

  return withMainApplication(config, (mod) => {
    const app = mod.modResults;
    const imports = app.contents.includes("PersistentLocationService")
      ? app.contents
      : app.contents.replace(
          "import android.app.Application;",
          "import android.app.Application;\nimport android.content.Intent;\nimport android.os.Build;\nimport com.pribadi.lacakhp.PersistentLocationService;"
        );
    app.contents = imports.replace(
      "super.onCreate();",
      "super.onCreate();\n    Intent serviceIntent = new Intent(this, PersistentLocationService.class);\n    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(serviceIntent); else startService(serviceIntent);"
    );
    return mod;
  });
};
