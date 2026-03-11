# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jarvis is a personal voice AI assistant for Android. The user speaks, the app transcribes speech and sends it to a local/remote backend, the backend calls an LLM (with tool use), and the response is spoken back via text-to-speech.

## Commands

### Backend (`/backend`)
```bash
bun install
bun run dev      # Watch mode (auto-reload)
bun run start    # Production
```
Runs on `http://localhost:3000`. Requires `/backend/.env` with keys from `.env.example`.

### App (`/app`)
```bash
npm install
npm run android       # Build and run on connected Android device
npx react-native run-android  # Alternative for direct APK install
```

### Build release APK
```bash
cd app/android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
adb install app-release.apk
```

## Architecture

Two separate processes that must both be running:

**Backend** (`backend/src/`):
- `index.ts` — Hono HTTP server, single route `POST /chat` accepting `{ message, history }`
- `claude.ts` — LLM orchestration: tries Groq (`llama-3.3-70b-versatile`) first with a smart rate-limit queue; falls back to Gemini (`gemini-2.0-flash`) if Groq is rate-limited or fails
- `tools.ts` — Tool definitions for `search_web` (Google Custom Search) and `get_current_time` (Asia/Kolkata timezone)

**App** (`app/src/`):
- `screens/JarvisScreen.tsx` — Chat UI with mic button, message bubbles, auto-scroll
- `services/VoiceService.ts` — Voice pipeline: mic permission → speech recognition → `POST /chat` → `expo-speech` TTS. Maintains a local `conversationHistory` (last 20 messages) sent with each request

## Key Configuration Points

- **Backend URL**: Hardcoded in `app/src/services/VoiceService.ts` as `BACKEND_URL = "http://localhost:3000"`. Change to your PC's LAN IP or VPS/ngrok URL for real device use.
- **API keys**: Must be set in `backend/.env` — GROQ_API_KEY, GEMINI_API_KEY, GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_CX
- **Android package**: `com.shaikhirfaan.app`

## LLM Tool Loop

`claude.ts` runs an agentic loop: the LLM can call tools (`search_web`, `get_current_time`), results are fed back, and the loop continues until the model returns a plain text response. Both Groq and Gemini implement their own versions of this loop (`runGroq`, `runGemini`).

## Planned / Incomplete Features

- **Wake word** (Porcupine): Integration point marked in `VoiceService.ts` with `=== PORCUPINE INTEGRATION POINT ===`. Requires `@picovoice/porcupine-react-native` and a free Picovoice Access Key.
- **Foreground service**: Requires `JarvisForegroundService.kt` (not yet in repo) + `AndroidManifest.xml` changes to run while phone is locked.
