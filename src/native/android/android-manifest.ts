import type { NativiteConfig } from "../../index.ts";

export function androidManifestTemplate(config: NativiteConfig): string {
  const includesContacts =
    config.plugins?.some((plugin) => plugin.name === "nativite-contacts") ?? false;
  const contactsPermissions = includesContacts
    ? `
    <uses-permission android:name="android.permission.READ_CONTACTS" />
`
    : "";
  const includesCalendar =
    config.plugins?.some((plugin) => plugin.name === "nativite-calendar") ?? false;
  const calendarPermissions = includesCalendar
    ? `
    <uses-permission android:name="android.permission.READ_CALENDAR" />
    <uses-permission android:name="android.permission.WRITE_CALENDAR" />
`
    : "";
  const includesNotifications =
    config.plugins?.some((plugin) => plugin.name === "nativite-notifications") ?? false;
  const notificationsPermissions = includesNotifications
    ? `
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
${contactsPermissions}${calendarPermissions}${notificationsPermissions}

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.${sanitizeName(config.app.name)}"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "");
}
