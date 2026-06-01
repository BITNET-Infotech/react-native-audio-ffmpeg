# react-native-audio-ffmpeg — Example App

A full, runnable React Native demo covering every API method.

## Screens

| Tab | What it demos |
|-----|---------------|
| 🔄 Convert | `AudioFFmpeg.convert()` — pick any audio file, choose output format (MP3/AAC/OGG/OPUS/FLAC/WAV) |
| 🔗 Merge | `AudioFFmpeg.merge()` — pick 2+ files, reorder them, pick output format |
| ✂️ Trim | `AudioFFmpeg.trim()` — enter start/end time, stream copy or re-encode |
| 🛠 Tools | `changeBitrate`, `changeSpeed`, `changeVolume`, `mix`, `normalize`, raw FFmpeg command |
| ℹ️ Info | Library version, supported formats, full API reference |

## Setup (first time)

```bash
cd example
bash setup.sh
```

This scaffolds the Android/iOS native folders, installs all JS deps, and runs `pod install`.

## Run

```bash
# Android
yarn android

# iOS
yarn ios

# Metro (in a separate terminal)
yarn start
```

## Requirements

- React Native 0.85+ (New Architecture / Turbo Modules)
- Android: `newArchEnabled=true` in `android/gradle.properties`
- iOS: `pod install` after setup

## How it resolves the local library

`metro.config.js` adds `../` (the library root) to `watchFolders`. Any edit you make in `../src/` is picked up by Metro and hot-reloaded — no reinstall needed.

The `package.json` dependency is:
```json
"@bitnet-infotech/react-native-audio-ffmpeg": "file:../"
```

## Permissions

**Android** — The app uses `react-native-document-picker` which handles storage permissions automatically on Android 13+.

**iOS** — No special permissions needed; the document picker presents the system file browser.
