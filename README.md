# 🤖 Jarvis — Personal Voice AI

Always-on, wake-word activated AI assistant for Android.
Say **"Hey Jarvis"** and it does whatever you ask.

---

## 📁 Project Structure

```
jarvis/
├── backend/          ← Bun + Hono server (runs on your PC/VPS)
│   ├── src/
│   │   ├── index.ts  ← Server entry
│   │   ├── claude.ts ← Claude API + tool loop
│   │   └── tools.ts  ← Web search, email, calendar
│   └── .env.example  ← Copy to .env and fill in keys
│
└── app/              ← React Native Android app
    ├── App.tsx
    └── src/
        ├── screens/JarvisScreen.tsx   ← Main UI
        └── services/VoiceService.ts   ← Wake word + voice pipeline
```

---

## 🚀 Setup Guide

### Step 1 — Backend

```bash
cd jarvis/backend
cp .env.example .env
# Fill in your API keys in .env

bun install
bun run dev
```

Your server runs on `http://localhost:3000`

**Get API Keys:**
- **Anthropic**: https://console.anthropic.com
- **Brave Search** (free 2000/mo): https://brave.com/search/api/
- **Google OAuth** (Gmail + Calendar): https://developers.google.com/oauthplayground
  - Scopes: `gmail.send`, `gmail.readonly`, `calendar`

---

### Step 2 — React Native App

```bash
cd jarvis/app
npm install

# Set your backend URL in src/services/VoiceService.ts
# Change: const BACKEND_URL = 'http://YOUR_SERVER_IP:3000'
# Use your PC's local IP if phone and PC are on same WiFi
# Or deploy backend to a VPS for anywhere access

# Build and install on your Android phone
npx react-native run-android
```

---

### Step 3 — Wake Word (Porcupine)

1. Sign up free at https://console.picovoice.ai/
2. Get your **Access Key** (free tier works)
3. Download the **"Hey Jarvis" wake word** (.ppn file) or use built-in "JARVIS" keyword
4. Add to `VoiceService.ts` where marked `=== PORCUPINE INTEGRATION POINT ===`

```typescript
import { Porcupine, BuiltInKeywords } from '@picovoice/porcupine-react-native';

const porcupine = await Porcupine.fromBuiltInKeywords(
  'YOUR_PICOVOICE_ACCESS_KEY',
  [BuiltInKeywords.JARVIS]
);
```

---

### Step 4 — Foreground Service (Works When Locked)

Add to your `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<service
    android:name=".JarvisForegroundService"
    android:foregroundServiceType="microphone"
    android:exported="false" />
```

Copy `android_service/JarvisForegroundService.kt` to:
`android/app/src/main/java/com/jarvisapp/JarvisForegroundService.kt`

Start the service from your app:
```typescript
import { NativeModules } from 'react-native';
// Start foreground service on app launch
```

---

### Step 5 — Build APK & Sideload

```bash
cd android
./gradlew assembleRelease

# APK location:
# android/app/build/outputs/apk/release/app-release.apk

# Install on phone:
adb install app-release.apk
# OR transfer APK to phone and install manually
# (Enable "Install from unknown sources" in Android settings first)
```

---

## 🗣️ What You Can Say

| Command | What Happens |
|---|---|
| "Hey Jarvis, what's the weather today?" | Web search |
| "Hey Jarvis, read my latest emails" | Gmail fetch |
| "Hey Jarvis, send an email to john@gmail.com about the meeting" | Gmail send |
| "Hey Jarvis, what's on my calendar this week?" | Calendar fetch |
| "Hey Jarvis, schedule a meeting tomorrow at 3pm" | Calendar create |
| "Hey Jarvis, what time is it?" | Current time |
| "Hey Jarvis, search for latest iPhone news" | Web search |

---

## 🔋 Battery Tips

- Porcupine uses <5% CPU — safe for always-on
- Keep phone plugged in at your desk for best experience
- Disable battery optimization for your app:
  Settings → Battery → App optimization → JarvisApp → Don't optimize

---

## 🌐 Remote Access (Access from Anywhere)

If you want Jarvis to work on mobile data (not just home WiFi):

1. Deploy backend to a VPS (DigitalOcean, Railway, etc.)
2. Or use **ngrok** for quick tunneling: `ngrok http 3000`
3. Update `BACKEND_URL` in VoiceService.ts to your public URL
