/**
 * Expo Config Plugin — Native AlarmModule for MedicAI
 *
 * Automatically integrates the Android native alarm module during `expo prebuild` or EAS Build.
 * This plugin:
 *   1. Copies all Java source files to the generated Android project.
 *   2. Merges required AndroidManifest entries (permissions, receivers, activity).
 *   3. Registers AlarmPackage in MainApplication (Java and Kotlin).
 *
 * Run `npx expo prebuild --clean` after modifying this file or the Java sources.
 */

const { withAndroidManifest, withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Source Java files (inside app/android-native/)
const JAVA_SRC_DIR = path.join(
  __dirname,
  '..',
  'android-native',
  'java',
  'com',
  'william20',
  'medicai',
);
const DEST_PACKAGE_PARTS = ['com', 'william20', 'medicai'];

// ─── Manifest helpers ─────────────────────────────────────────────────────────

function ensurePermission(manifest, name) {
  if (!manifest['uses-permission']) manifest['uses-permission'] = [];
  const already = manifest['uses-permission'].some(p => p.$['android:name'] === name);
  if (!already) manifest['uses-permission'].push({ $: { 'android:name': name } });
}

function ensureReceiver(application, name, attrs, intentFilters) {
  if (!application.receiver) application.receiver = [];
  const already = application.receiver.some(r => r.$['android:name'] === name);
  if (already) return;
  const entry = { $: { 'android:name': name, ...attrs } };
  if (intentFilters && intentFilters.length) entry['intent-filter'] = intentFilters;
  application.receiver.push(entry);
}

function ensureActivity(application, name, attrs) {
  if (!application.activity) application.activity = [];
  const already = application.activity.some(a => a.$['android:name'] === name);
  if (!already) application.activity.push({ $: { 'android:name': name, ...attrs } });
}

function ensureService(application, name, attrs) {
  if (!application.service) application.service = [];
  const already = application.service.some(s => s.$['android:name'] === name);
  if (!already) application.service.push({ $: { 'android:name': name, ...attrs } });
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const withAlarmModule = config => {
  // ── Step 1: Copy Java files ──────────────────────────────────────────────
  config = withDangerousMod(config, [
    'android',
    async config => {
      const androidRoot = config.modRequest.platformProjectRoot;
      const destDir = path.join(androidRoot, 'app', 'src', 'main', 'java', ...DEST_PACKAGE_PARTS);

      fs.mkdirSync(destDir, { recursive: true });

      if (!fs.existsSync(JAVA_SRC_DIR)) {
        console.warn('[withAlarmModule] Source directory not found:', JAVA_SRC_DIR);
        return config;
      }

      for (const file of fs.readdirSync(JAVA_SRC_DIR)) {
        if (!file.endsWith('.java')) continue;
        const src = path.join(JAVA_SRC_DIR, file);
        const dest = path.join(destDir, file);
        fs.copyFileSync(src, dest);
        console.log('[withAlarmModule] Copied', file);
      }

      return config;
    },
  ]);

  // ── Step 2: AndroidManifest entries ─────────────────────────────────────
  config = withAndroidManifest(config, config => {
    const { manifest } = config.modResults;
    const application = manifest.application[0];

    // Permissions required for exact medical alarms
    ensurePermission(manifest, 'android.permission.SCHEDULE_EXACT_ALARM');
    ensurePermission(manifest, 'android.permission.USE_EXACT_ALARM');
    ensurePermission(manifest, 'android.permission.USE_FULL_SCREEN_INTENT');
    ensurePermission(manifest, 'android.permission.RECEIVE_BOOT_COMPLETED');
    ensurePermission(manifest, 'android.permission.WAKE_LOCK');
    ensurePermission(manifest, 'android.permission.VIBRATE');
    ensurePermission(manifest, 'android.permission.FOREGROUND_SERVICE');
    ensurePermission(manifest, 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK');
    ensurePermission(manifest, 'android.permission.POST_NOTIFICATIONS');
    ensurePermission(manifest, 'android.permission.SYSTEM_ALERT_WINDOW');

    // AlarmReceiver — handles fired alarms and shows full-screen notification
    ensureReceiver(application, 'com.william20.medicai.AlarmReceiver', {
      'android:exported': 'false',
    });

    // BootReceiver — re-schedules alarms after device restart
    ensureReceiver(
      application,
      'com.william20.medicai.BootReceiver',
      { 'android:enabled': 'true', 'android:exported': 'true' },
      [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
          ],
        },
      ],
    );

    // AlarmActivity — full-screen activity shown over the lock screen
    ensureActivity(application, 'com.william20.medicai.AlarmActivity', {
      'android:exported': 'true',
      'android:showWhenLocked': 'true',
      'android:turnScreenOn': 'true',
      'android:launchMode': 'singleTop',
      'android:excludeFromRecents': 'true',
      'android:taskAffinity': '',
      'android:theme': '@style/Theme.AppCompat.DayNight.NoActionBar',
    });

    // AlarmService — foreground service for looping alarm sound/vibration
    ensureService(application, 'com.william20.medicai.AlarmService', {
      'android:exported': 'false',
      'android:foregroundServiceType': 'mediaPlayback',
    });

    return config;
  });

  // ── Step 3: Register AlarmPackage in MainApplication ────────────────────
  config = withDangerousMod(config, [
    'android',
    async config => {
      const androidRoot = config.modRequest.platformProjectRoot;
      const appPackage = config.android?.package ?? 'com.william20.medicai';
      const packageParts = appPackage.split('.');

      const javaPath = path.join(
        androidRoot, 'app', 'src', 'main', 'java',
        ...packageParts, 'MainApplication.java',
      );
      const ktPath = path.join(
        androidRoot, 'app', 'src', 'main', 'java',
        ...packageParts, 'MainApplication.kt',
      );

      if (fs.existsSync(ktPath)) {
        let kt = fs.readFileSync(ktPath, 'utf8');

        if (!kt.includes('import com.william20.medicai.AlarmPackage')) {
          // Insert import after the package declaration
          kt = kt.replace(
            /^(package .+)(\r?\n)/m,
            `$1$2\nimport com.william20.medicai.AlarmPackage\n`,
          );
        }

        if (!kt.includes('AlarmPackage()')) {
          // RN 0.81 / Expo 54: PackageList(this).packages.apply {
          if (kt.includes('PackageList(this).packages.apply {')) {
            kt = kt.replace(
              /PackageList\(this\)\.packages\.apply\s*\{/,
              'PackageList(this).packages.apply {\n              add(AlarmPackage())',
            );
          // RN 0.76+: getPackages() override returning list
          } else if (kt.includes('PackageList(this).packages')) {
            kt = kt.replace(
              'PackageList(this).packages',
              'PackageList(this).packages.apply { add(AlarmPackage()) }',
            );
          }
        }

        fs.writeFileSync(ktPath, kt);
        console.log('[withAlarmModule] Registered AlarmPackage in MainApplication.kt');
      } else if (fs.existsSync(javaPath)) {
        let java = fs.readFileSync(javaPath, 'utf8');

        if (!java.includes('import com.william20.medicai.AlarmPackage')) {
          java = java.replace(
            /^(import java\.util\.List;)/m,
            `import com.william20.medicai.AlarmPackage;\n$1`,
          );
        }

        if (!java.includes('new AlarmPackage()')) {
          java = java.replace(
            'List<ReactPackage> packages = new PackageList(this).getPackages();',
            'List<ReactPackage> packages = new PackageList(this).getPackages();\n      packages.add(new AlarmPackage());',
          );
        }

        fs.writeFileSync(javaPath, java);
        console.log('[withAlarmModule] Registered AlarmPackage in MainApplication.java');
      } else {
        console.warn('[withAlarmModule] MainApplication not found at:', javaPath);
      }

      return config;
    },
  ]);

  // ── Step 4: Force debug builds to bundle JS + assets (standalone APK) ──
  config = withAppBuildGradle(config, config => {
    let gradle = config.modResults.contents;

    // Set debuggableVariants = [] so assembleDebug bundles JS + assets
    // just like release. This enables standalone APK builds without Metro.
    if (gradle.includes('// debuggableVariants = ["liteDebug", "prodDebug"]')) {
      gradle = gradle.replace(
        '// debuggableVariants = ["liteDebug", "prodDebug"]',
        'debuggableVariants = []',
      );
    } else if (!gradle.includes('debuggableVariants = []')) {
      // Insert after bundleCommand line if the comment isn't found
      gradle = gradle.replace(
        'bundleCommand = "export:embed"',
        'bundleCommand = "export:embed"\n    debuggableVariants = []',
      );
    }

    config.modResults.contents = gradle;
    return config;
  });

  return config;
};

module.exports = withAlarmModule;
