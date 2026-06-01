# react-native-audio-ffmpeg — Usage Guide

Universal audio processing for React Native (New Architecture / Turbo Module).  
No format restrictions — any codec or container FFmpeg supports works here.

**Repository:** https://github.com/BITNET-Infotech/react-native-audio-ffmpeg

---

## Table of Contents

1. [Installation](#1-installation)
2. [File Paths — Android & iOS](#2-file-paths--android--ios)
3. [Types](#3-types)
4. [Method Reference](#4-method-reference)
   - [run()](#41-run--raw-ffmpeg-command)
   - [runAsync()](#42-runasync--async-with-live-progress)
   - [cancel()](#43-cancel)
   - [merge()](#44-merge)
   - [convert()](#45-convert)
   - [trim()](#46-trim)
   - [changeBitrate()](#47-changebitrate)
   - [changeSpeed()](#48-changespeed)
   - [changeVolume()](#49-changevolume)
   - [mix()](#410-mix)
   - [normalize()](#411-normalize)
   - [onLog()](#412-onlog--onprogress--oncomplete)
   - [getVersion()](#413-getversion)
5. [Error Handling](#5-error-handling)
6. [Real-World Recipes](#6-real-world-recipes)
7. [Permissions Setup](#7-permissions-setup)

---

## 1. Installation

```bash
npm install @bitnet-infotech/react-native-audio-ffmpeg
# or
yarn add @bitnet-infotech/react-native-audio-ffmpeg
```

```bash
# iOS only — Android autolinks via Gradle
cd ios && pod install
```

**Requirements**

| | Minimum |
|---|---|
| React Native | 0.78+ |
| React | 19.0+ |
| Android | API 24 (Android 7) |
| iOS | 15.1 |

---

## 2. File Paths — Android & iOS

FFmpeg operates on local file paths, **not** `content://` URIs or asset URLs.  
Use a library like [`react-native-fs`](https://github.com/itinance/react-native-fs) or [`expo-file-system`](https://docs.expo.dev/versions/latest/sdk/filesystem/) to resolve real paths.

### With react-native-fs

```typescript
import RNFS from 'react-native-fs';

// Android
const inputPath  = `${RNFS.ExternalStorageDirectoryPath}/Music/song.mp3`;
const outputPath = `${RNFS.CachesDirectoryPath}/out.mp3`;

// iOS
const inputPath  = `${RNFS.DocumentDirectoryPath}/song.mp3`;
const outputPath = `${RNFS.CachesDirectoryPath}/out.mp3`;
```

### With expo-file-system

```typescript
import * as FileSystem from 'expo-file-system';

const inputPath  = FileSystem.documentDirectory + 'song.mp3';
const outputPath = FileSystem.cacheDirectory  + 'out.mp3';
```

### Quick helper

```typescript
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

export function cacheFile(name: string) {
  return `${RNFS.CachesDirectoryPath}/${name}`;
}

export function docFile(name: string) {
  const base = Platform.OS === 'android'
    ? RNFS.ExternalStorageDirectoryPath
    : RNFS.DocumentDirectoryPath;
  return `${base}/${name}`;
}
```

---

## 3. Types

```typescript
import type {
  AudioSession,
  AudioProgressEvent,
  AudioLogEvent,
  AudioCompleteEvent,
} from '@bitnet-infotech/react-native-audio-ffmpeg';

// Returned by all blocking methods (run, merge, convert, trim, ...)
interface AudioSession {
  returnCode: number;   // 0 = success
  output:     string;   // Full FFmpeg log (stdout + stderr)
  duration:   number;   // Execution time in ms
}

// Fired periodically during runAsync()
interface AudioProgressEvent {
  sessionId: string;
  time:      number;   // Position in output file (ms)
  size:      number;   // Output size so far (bytes)
  bitrate:   number;   // Current bitrate (kb/s)
  speed:     number;   // Processing speed (1.0 = realtime)
}

// Each line of FFmpeg log output
interface AudioLogEvent {
  sessionId: string;
  line:      string;
}

// Fired once when runAsync() finishes
interface AudioCompleteEvent {
  sessionId:  string;
  returnCode: number;
  output:     string;
}
```

---

## 4. Method Reference

### 4.1 `run()` — Raw FFmpeg command

```typescript
AudioFFmpeg.run(command: string): Promise<AudioSession>
```

The universal entry point. Pass any valid FFmpeg argument string (everything after `ffmpeg`).  
All helper methods below call this internally.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// Basic usage
const result = await AudioFFmpeg.run(
  '-i /path/input.wav -ab 192k /path/output.mp3'
);
console.log(result.returnCode); // 0 = success
console.log(result.duration);   // e.g. 3200 ms
console.log(result.output);     // FFmpeg log lines

// Convert WAV → OPUS with custom encoder settings
await AudioFFmpeg.run(
  '-i /path/input.wav -c:a libopus -b:a 128k -vbr on -compression_level 10 /path/output.opus'
);

// Extract metadata probe (ffmpeg -i reads headers, outputs to log)
const info = await AudioFFmpeg.run('-i /path/song.mp3 -f null -');
console.log(info.output); // contains duration, bitrate, codec info

// Apply equalizer (boost bass)
await AudioFFmpeg.run(
  '-i /path/input.mp3 -af "equalizer=f=100:width_type=o:width=2:g=5" /path/boosted.mp3'
);

// Remove silence from beginning
await AudioFFmpeg.run(
  '-i /path/input.mp3 -af "silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB" /path/no_silence.mp3'
);

// Fade in 3s at start, fade out 3s at end (total duration 120s)
await AudioFFmpeg.run(
  '-i /path/input.mp3 -af "afade=t=in:st=0:d=3,afade=t=out:st=117:d=3" /path/faded.mp3'
);
```

---

### 4.2 `runAsync()` — Async with live progress

```typescript
AudioFFmpeg.runAsync(
  command: string,
  callbacks?: {
    onLog?:      (e: AudioLogEvent)      => void;
    onProgress?: (e: AudioProgressEvent) => void;
    onComplete?: (e: AudioCompleteEvent) => void;
  }
): Promise<string>  // resolves with sessionId
```

Same as `run()` but non-blocking — fires callbacks as output arrives.  
Use this for long operations where you want to show a progress bar.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';
import { useState } from 'react';

function ConvertScreen() {
  const [progress, setProgress] = useState(0);
  const [status,   setStatus]   = useState('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const startConvert = async () => {
    setStatus('running');

    const id = await AudioFFmpeg.runAsync(
      '-i /storage/emulated/0/Music/big.wav /storage/emulated/0/Music/out.mp3',
      {
        onLog: (e) => {
          console.log('[ffmpeg]', e.line);
        },

        onProgress: (e) => {
          // speed: 1.0 = realtime, 2.5 = 2.5× faster than realtime
          console.log(`Time: ${e.time}ms | Speed: ${e.speed}x | Size: ${e.size} bytes`);
          // If you know the total duration you can calculate %:
          // setProgress(e.time / totalDurationMs);
        },

        onComplete: (e) => {
          if (e.returnCode === 0) {
            setStatus('done');
          } else {
            setStatus('error');
            console.error('FFmpeg failed:\n', e.output);
          }
        },
      }
    );

    setSessionId(id);
  };

  const cancelConvert = async () => {
    if (sessionId) {
      await AudioFFmpeg.cancel(sessionId);
      setStatus('cancelled');
    }
  };

  // ...
}
```

---

### 4.3 `cancel()`

```typescript
AudioFFmpeg.cancel(sessionId: string): Promise<void>
```

Stops a running `runAsync()` session mid-execution. Safe to call even if the session already finished.

```typescript
const id = await AudioFFmpeg.runAsync('-i /big.wav /out.mp3');
// Later...
await AudioFFmpeg.cancel(id);
console.log('Cancelled');
```

---

### 4.4 `merge()`

```typescript
AudioFFmpeg.merge(inputs: string[], output: string): Promise<AudioSession>
```

Concatenates two or more audio files in order. Any mix of input formats works.  
Output format is determined by the output file extension.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// Merge three MP3s into one
const result = await AudioFFmpeg.merge(
  [
    '/sdcard/Music/part1.mp3',
    '/sdcard/Music/part2.mp3',
    '/sdcard/Music/part3.mp3',
  ],
  '/sdcard/Music/full.mp3'
);
console.log(`Merged in ${result.duration}ms`);

// Mix of different input formats — all work
await AudioFFmpeg.merge(
  [
    '/sdcard/intro.flac',
    '/sdcard/middle.ogg',
    '/sdcard/outro.aac',
  ],
  '/sdcard/merged.flac'   // output as FLAC
);

// Merge and output as WAV
await AudioFFmpeg.merge(
  ['/docs/a.m4a', '/docs/b.m4a'],
  '/docs/combined.wav'
);

// React Native UI example
import RNFS from 'react-native-fs';

const mergeRecordings = async (recordings: string[]) => {
  const output = `${RNFS.CachesDirectoryPath}/merged_${Date.now()}.mp3`;

  try {
    await AudioFFmpeg.merge(recordings, output);
    return output;
  } catch (err: any) {
    console.error('Merge failed:', err.message);
    throw err;
  }
};
```

---

### 4.5 `convert()`

```typescript
AudioFFmpeg.convert(
  input:   string,
  output:  string,
  options?: string  // extra FFmpeg flags
): Promise<AudioSession>
```

Converts any audio file to any other audio format. Output format = file extension.  
Use `options` to pass extra FFmpeg flags for full codec control.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// ── Simple conversions ─────────────────────────────────────────────────────

// WAV → MP3
await AudioFFmpeg.convert('/path/input.wav', '/path/output.mp3');

// FLAC → AAC
await AudioFFmpeg.convert('/path/input.flac', '/path/output.aac');

// M4A → OGG
await AudioFFmpeg.convert('/path/input.m4a', '/path/output.ogg');

// MP3 → WAV (uncompressed)
await AudioFFmpeg.convert('/path/input.mp3', '/path/output.wav');

// ── With custom codec flags ────────────────────────────────────────────────

// WAV → MP3, VBR best quality (V0)
await AudioFFmpeg.convert('/path/input.wav', '/path/output.mp3', '-q:a 0');

// WAV → MP3, CBR 320k
await AudioFFmpeg.convert('/path/input.wav', '/path/output.mp3', '-b:a 320k');

// WAV → OPUS, 128k with variable bitrate
await AudioFFmpeg.convert(
  '/path/input.wav',
  '/path/output.opus',
  '-c:a libopus -b:a 128k -vbr on'
);

// WAV → FLAC, highest compression
await AudioFFmpeg.convert(
  '/path/input.wav',
  '/path/output.flac',
  '-c:a flac -compression_level 12'
);

// MP3 → AAC (for Apple devices), 256k, stereo
await AudioFFmpeg.convert(
  '/path/input.mp3',
  '/path/output.m4a',
  '-c:a aac -b:a 256k -ac 2'
);

// Resample to 44100 Hz
await AudioFFmpeg.convert(
  '/path/input.mp3',
  '/path/output.mp3',
  '-ar 44100'
);

// Convert stereo → mono
await AudioFFmpeg.convert(
  '/path/input.mp3',
  '/path/output.mp3',
  '-ac 1'
);

// ── React Native utility function ─────────────────────────────────────────

import RNFS from 'react-native-fs';

const convertAudio = async (
  inputPath: string,
  targetFormat: 'mp3' | 'aac' | 'flac' | 'opus' | 'wav',
  bitrate = '192k'
) => {
  const filename = `converted_${Date.now()}.${targetFormat}`;
  const output   = `${RNFS.CachesDirectoryPath}/${filename}`;

  await AudioFFmpeg.convert(inputPath, output, `-b:a ${bitrate}`);
  return output;
};
```

---

### 4.6 `trim()`

```typescript
AudioFFmpeg.trim(
  input:    string,
  output:   string,
  start:    string,  // "HH:MM:SS", "MM:SS", or plain seconds "90"
  end:      string,  // same format
  reencode?: boolean // default false (stream copy = fast, no quality loss)
): Promise<AudioSession>
```

Trims audio to a start/end time range.

**Stream copy** (default, `reencode: false`) — ultra fast, no re-encoding, no quality loss.  
**Re-encode** (`reencode: true`) — slower, but frame-accurate cuts.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// ── Basic trim ─────────────────────────────────────────────────────────────

// Trim from 1:00 to 2:30 using HH:MM:SS
await AudioFFmpeg.trim(
  '/path/long_podcast.mp3',
  '/path/clip.mp3',
  '00:01:00',
  '00:02:30'
);

// Same with plain seconds
await AudioFFmpeg.trim('/path/long.mp3', '/path/clip.mp3', '60', '150');

// Trim the first 30 seconds
await AudioFFmpeg.trim('/path/song.mp3', '/path/intro.mp3', '0', '30');

// Trim from 2:15 to the end (use a large end time)
await AudioFFmpeg.trim('/path/song.mp3', '/path/tail.mp3', '00:02:15', '99:00:00');

// ── Re-encode for frame-accurate cuts ─────────────────────────────────────
// Use when stream copy produces a slightly wrong start point (common with MP3)
await AudioFFmpeg.trim(
  '/path/long.mp3',
  '/path/clip.mp3',
  '00:01:00',
  '00:02:30',
  true  // reencode = true
);

// ── React Native waveform editor example ──────────────────────────────────

import RNFS from 'react-native-fs';
import { useState } from 'react';

function AudioEditor({ sourceFile }: { sourceFile: string }) {
  const [startSec, setStartSec] = useState(0);
  const [endSec,   setEndSec]   = useState(30);

  const saveTrim = async () => {
    const output = `${RNFS.CachesDirectoryPath}/trimmed_${Date.now()}.mp3`;
    await AudioFFmpeg.trim(
      sourceFile,
      output,
      String(startSec),
      String(endSec)
    );
    return output;
  };

  // ...
}
```

---

### 4.7 `changeBitrate()`

```typescript
AudioFFmpeg.changeBitrate(
  input:   string,
  output:  string,
  bitrate: string   // e.g. "128k", "192k", "320k"
): Promise<AudioSession>
```

Re-encodes the audio at a different bitrate. Works with any format.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// Reduce file size — 320k → 128k
await AudioFFmpeg.changeBitrate(
  '/path/hq.mp3',
  '/path/compressed.mp3',
  '128k'
);

// Increase quality — 96k → 320k
await AudioFFmpeg.changeBitrate(
  '/path/low.mp3',
  '/path/better.mp3',
  '320k'
);

// Works across formats too — FLAC source, lower bitrate AAC output
await AudioFFmpeg.changeBitrate(
  '/path/master.flac',
  '/path/streaming.aac',
  '192k'
);

// ── File size estimator ────────────────────────────────────────────────────

// Rough estimate: size_MB ≈ (bitrate_kbps × duration_s) / 8000
// 3-min song @ 128k ≈ (128 × 180) / 8000 ≈ 2.88 MB
// 3-min song @ 320k ≈ (320 × 180) / 8000 ≈ 7.20 MB

const common = ['64k', '96k', '128k', '192k', '256k', '320k'];

for (const br of common) {
  const out = `/path/sample_${br}.mp3`;
  await AudioFFmpeg.changeBitrate('/path/original.mp3', out, br);
}
```

---

### 4.8 `changeSpeed()`

```typescript
AudioFFmpeg.changeSpeed(
  input:  string,
  output: string,
  speed:  number   // 0.5 = half speed, 1.0 = normal, 2.0 = double speed
): Promise<AudioSession>
```

Changes playback speed using the `atempo` filter. Pitch is preserved (unlike raw rate change).  
For speed outside the 0.5–2.0 range, the library automatically chains multiple `atempo` filters.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// 1.5× faster (podcast listening speed)
await AudioFFmpeg.changeSpeed('/path/podcast.mp3', '/path/fast.mp3', 1.5);

// 0.75× slower (music practice / ear training)
await AudioFFmpeg.changeSpeed('/path/song.mp3', '/path/slow.mp3', 0.75);

// 2.0× — maximum single atempo factor
await AudioFFmpeg.changeSpeed('/path/audio.mp3', '/path/2x.mp3', 2.0);

// 0.5× — minimum single atempo factor
await AudioFFmpeg.changeSpeed('/path/audio.mp3', '/path/half.mp3', 0.5);

// 3.0× — library auto-chains two atempo filters (2.0 × 1.5)
await AudioFFmpeg.changeSpeed('/path/audio.mp3', '/path/3x.mp3', 3.0);

// 0.25× — library auto-chains (0.5 × 0.5)
await AudioFFmpeg.changeSpeed('/path/audio.mp3', '/path/quarter.mp3', 0.25);

// ── Speed slider in React Native ───────────────────────────────────────────

import { Slider } from '@react-native-community/slider';
import { useState } from 'react';

function SpeedControl({ inputFile }: { inputFile: string }) {
  const [speed, setSpeed] = useState(1.0);

  const applySpeed = async () => {
    const output = `/path/cache/speed_${speed.toFixed(2)}.mp3`;
    await AudioFFmpeg.changeSpeed(inputFile, output, speed);
    // play output...
  };

  return (
    <Slider
      minimumValue={0.5}
      maximumValue={3.0}
      step={0.25}
      value={speed}
      onValueChange={setSpeed}
    />
  );
}
```

---

### 4.9 `changeVolume()`

```typescript
AudioFFmpeg.changeVolume(
  input:  string,
  output: string,
  volume: number   // 1.0 = original, 2.0 = double, 0.5 = half
): Promise<AudioSession>
```

Adjusts the audio volume using the `volume` filter. Works with any format.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// Double the volume
await AudioFFmpeg.changeVolume('/path/quiet.mp3', '/path/louder.mp3', 2.0);

// Cut volume to 50%
await AudioFFmpeg.changeVolume('/path/loud.mp3', '/path/softer.mp3', 0.5);

// Boost by 6 dB (≈ 2.0 in linear scale)
await AudioFFmpeg.changeVolume('/path/input.mp3', '/path/output.mp3', 2.0);

// Reduce by 6 dB (≈ 0.5 in linear scale)
await AudioFFmpeg.changeVolume('/path/input.mp3', '/path/output.mp3', 0.5);

// Mute (volume = 0)
await AudioFFmpeg.changeVolume('/path/input.mp3', '/path/muted.mp3', 0.0);

// ── dB ↔ linear conversion helper ─────────────────────────────────────────

const dbToLinear = (db: number) => Math.pow(10, db / 20);
const linearToDb = (linear: number) => 20 * Math.log10(linear);

// Boost by +3 dB
await AudioFFmpeg.changeVolume(
  '/path/input.mp3',
  '/path/output.mp3',
  dbToLinear(3)   // ≈ 1.413
);

// ── Volume slider ──────────────────────────────────────────────────────────

import { Slider } from '@react-native-community/slider';

// Slider from 0.0 to 3.0 (0% to 300%)
<Slider
  minimumValue={0.0}
  maximumValue={3.0}
  step={0.1}
  value={1.0}
  onSlidingComplete={async (v) => {
    await AudioFFmpeg.changeVolume(inputFile, outputFile, v);
  }}
/>
```

---

### 4.10 `mix()`

```typescript
AudioFFmpeg.mix(
  input1:  string,
  input2:  string,
  output:  string,
  options?: {
    secondVolume?: number   // volume multiplier for input2, default 1.0
  }
): Promise<AudioSession>
```

Overlays two audio files so they play simultaneously. Output duration = longer of the two inputs.  
Use `secondVolume` to duck background music under a voice track.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// Simple mix — equal volume
await AudioFFmpeg.mix(
  '/path/voice.mp3',
  '/path/background_music.mp3',
  '/path/mixed.mp3'
);

// Voice-over with ducked music (music at 20% volume)
await AudioFFmpeg.mix(
  '/path/narration.mp3',
  '/path/music.mp3',
  '/path/voiceover.mp3',
  { secondVolume: 0.2 }
);

// Podcast intro jingle at 30% under the host voice
await AudioFFmpeg.mix(
  '/path/host_intro.mp3',
  '/path/jingle.mp3',
  '/path/podcast_intro.mp3',
  { secondVolume: 0.3 }
);

// Mix two recordings at equal volume
await AudioFFmpeg.mix(
  '/path/guitar.wav',
  '/path/vocals.wav',
  '/path/song.wav'
);

// ── Multi-track mix (via run()) ────────────────────────────────────────────
// For 3+ tracks, use run() directly with amix

await AudioFFmpeg.run(
  '-i /path/track1.mp3 ' +
  '-i /path/track2.mp3 ' +
  '-i /path/track3.mp3 ' +
  '-filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=longest[aout]" ' +
  '-map "[aout]" /path/mixed_3tracks.mp3'
);
```

---

### 4.11 `normalize()`

```typescript
AudioFFmpeg.normalize(
  input:  string,
  output: string
): Promise<AudioSession>
```

Applies EBU R128 loudness normalization. Targets **–16 LUFS** with **–1.5 dBTP** true peak.  
Standard for podcasts, streaming (Spotify, Apple Music normalize to –14 LUFS), and broadcast.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// Normalize a single file
await AudioFFmpeg.normalize('/path/variable_loudness.mp3', '/path/normalized.mp3');

// Normalize before merging — consistent loudness across all tracks
const normalize = async (input: string) => {
  const output = input.replace('.mp3', '_norm.mp3');
  await AudioFFmpeg.normalize(input, output);
  return output;
};

const tracks = ['/path/a.mp3', '/path/b.mp3', '/path/c.mp3'];
const normalizedTracks = await Promise.all(tracks.map(normalize));
await AudioFFmpeg.merge(normalizedTracks, '/path/final.mp3');

// ── Custom loudness target (via run()) ─────────────────────────────────────
// Default is -16 LUFS. To target -14 LUFS (Spotify loudness target):
await AudioFFmpeg.run(
  '-i /path/input.mp3 ' +
  '-af "loudnorm=I=-14:TP=-1.5:LRA=11" ' +
  '-y /path/output.mp3'
);

// Two-pass normalization for maximum accuracy:
// Pass 1: measure the loudness
const pass1 = await AudioFFmpeg.run(
  '-i /path/input.mp3 ' +
  '-af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" ' +
  '-f null -'
);
// Parse the JSON from pass1.output, then use the measured values in pass 2
// (see FFmpeg loudnorm documentation for full two-pass workflow)
```

---

### 4.12 `onLog()` / `onProgress()` / `onComplete()`

```typescript
// Global event subscriptions (catch events from ALL running sessions)
AudioFFmpeg.onLog(      callback: (e: AudioLogEvent)      => void ): EmitterSubscription
AudioFFmpeg.onProgress( callback: (e: AudioProgressEvent) => void ): EmitterSubscription
AudioFFmpeg.onComplete( callback: (e: AudioCompleteEvent) => void ): EmitterSubscription
```

Alternatively, pass callbacks directly to `runAsync()` to scope them to a single session.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';
import { useEffect } from 'react';

// ── Global subscription (useful for a global progress HUD) ─────────────────

useEffect(() => {
  const logSub      = AudioFFmpeg.onLog(e      => console.log('[log]',      e.line));
  const progressSub = AudioFFmpeg.onProgress(e => console.log('[progress]', e.speed));
  const completeSub = AudioFFmpeg.onComplete(e => console.log('[complete]', e.returnCode));

  // IMPORTANT: remove subscriptions to avoid memory leaks
  return () => {
    logSub.remove();
    progressSub.remove();
    completeSub.remove();
  };
}, []);

// ── Per-session callbacks via runAsync() ────────────────────────────────────

const sessionId = await AudioFFmpeg.runAsync(
  '-i /path/input.wav /path/output.mp3',
  {
    onLog:      (e) => console.log('[log]',      e.sessionId, e.line),
    onProgress: (e) => console.log('[progress]', e.sessionId, `${e.speed}x`),
    onComplete: (e) => console.log('[complete]', e.sessionId, e.returnCode),
  }
);
// Per-session callbacks are auto-cleaned up on complete — no manual removal needed.

// ── Progress bar with React state ─────────────────────────────────────────

import { useState, useRef } from 'react';
import { ProgressBarAndroid, View } from 'react-native';

function ProgressScreen({ totalDurationMs }: { totalDurationMs: number }) {
  const [pct, setPct] = useState(0);

  const startJob = async () => {
    await AudioFFmpeg.runAsync(
      '-i /path/big.wav /path/out.mp3',
      {
        onProgress: (e) => {
          const percent = Math.min(e.time / totalDurationMs, 1);
          setPct(percent);
        },
        onComplete: () => setPct(1),
      }
    );
  };

  return (
    <View>
      <ProgressBarAndroid styleAttr="Horizontal" progress={pct} />
    </View>
  );
}
```

---

### 4.13 `getVersion()`

```typescript
AudioFFmpeg.getVersion(): string
```

Returns the FFmpegKit native library version string synchronously. Called directly on the JS thread via JSI (no async needed).

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

const version = AudioFFmpeg.getVersion();
console.log(version); // e.g. "6.0.2"
```

---

## 5. Error Handling

All async methods reject with an `Error` whose `message` contains the exit code and FFmpeg log output. Always wrap in `try/catch`.

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

// ── Basic try/catch ────────────────────────────────────────────────────────

try {
  const result = await AudioFFmpeg.merge(
    ['/path/a.mp3', '/path/b.mp3'],
    '/path/out.mp3'
  );
  console.log('Done in', result.duration, 'ms');
} catch (err: any) {
  console.error('FFmpeg error:', err.message);
  // err.message contains the FFmpeg log — useful for debugging
}

// ── Check the output log for debugging ────────────────────────────────────

const result = await AudioFFmpeg.run('-i /path/input.mp3 -f null -');
if (result.returnCode !== 0) {
  console.error('Non-zero exit:', result.returnCode);
  console.error('Log:\n', result.output);
}

// ── Common error causes ────────────────────────────────────────────────────

// ❌ File not found
// "No such file or directory" in result.output
// → Check that the input path exists before calling

import RNFS from 'react-native-fs';

const exists = await RNFS.exists(inputPath);
if (!exists) throw new Error(`File not found: ${inputPath}`);

// ❌ Permission denied
// "Permission denied" in result.output
// → Request storage permissions (see Section 7 below)

// ❌ Output directory doesn't exist
// "No such file or directory" on output path
// → Create the parent directory first

await RNFS.mkdir(outputDir);

// ❌ Codec not supported
// "Encoder X not found" in result.output
// → The ffmpeg-kit-min build includes most audio codecs.
//   If you need a rare codec, use the full build.

// ── Typed error helper ────────────────────────────────────────────────────

interface FFmpegError extends Error {
  returnCode?: number;
  ffmpegOutput?: string;
}

const runSafe = async (command: string) => {
  try {
    return await AudioFFmpeg.run(command);
  } catch (err: any) {
    const e: FFmpegError = new Error(err.message);
    e.returnCode   = err.returnCode;
    e.ffmpegOutput = err.ffmpegOutput;
    throw e;
  }
};
```

---

## 6. Real-World Recipes

### Voice memo recorder — save as MP3

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';
import RNFS from 'react-native-fs';

// After recording via react-native-audio-recorder-player (saves as .m4a / .wav)
const saveVoiceMemo = async (rawRecording: string): Promise<string> => {
  const output = `${RNFS.DocumentDirectoryPath}/memo_${Date.now()}.mp3`;

  await AudioFFmpeg.convert(rawRecording, output, '-b:a 128k');

  // Delete the raw file to save space
  await RNFS.unlink(rawRecording);

  return output;
};
```

---

### Podcast editor — merge episodes with jingle

```typescript
const buildPodcastEpisode = async (params: {
  intro:    string;
  segments: string[];
  outro:    string;
  jingle:   string;
}) => {
  const { intro, segments, outro, jingle } = params;
  const cacheDir = RNFS.CachesDirectoryPath;

  // 1. Normalize all segments for consistent loudness
  const normalized = await Promise.all(
    [intro, ...segments, outro].map(async (file, i) => {
      const out = `${cacheDir}/norm_${i}.mp3`;
      await AudioFFmpeg.normalize(file, out);
      return out;
    })
  );

  // 2. Merge all segments into one
  const merged = `${cacheDir}/merged.mp3`;
  await AudioFFmpeg.merge(normalized, merged);

  // 3. Add jingle as background music (at 15% volume)
  const output = `${RNFS.DocumentDirectoryPath}/episode_${Date.now()}.mp3`;
  await AudioFFmpeg.mix(merged, jingle, output, { secondVolume: 0.15 });

  // 4. Clean up temp files
  await Promise.all([merged, ...normalized].map(f => RNFS.unlink(f).catch(() => {})));

  return output;
};
```

---

### Audio book chapter splitter

```typescript
type Chapter = { title: string; startSec: number; endSec: number };

const splitAudioBook = async (
  audioBook: string,
  chapters: Chapter[]
): Promise<string[]> => {
  const outputPaths: string[] = [];

  for (const ch of chapters) {
    const output = `${RNFS.DocumentDirectoryPath}/${ch.title}.mp3`;
    await AudioFFmpeg.trim(audioBook, output, String(ch.startSec), String(ch.endSec));
    outputPaths.push(output);
  }

  return outputPaths;
};

// Usage
const chapters: Chapter[] = [
  { title: 'Chapter_01', startSec: 0,    endSec: 840  },
  { title: 'Chapter_02', startSec: 840,  endSec: 1920 },
  { title: 'Chapter_03', startSec: 1920, endSec: 3100 },
];

const files = await splitAudioBook('/path/audiobook.mp3', chapters);
```

---

### Batch compressor — compress folder of FLACs to MP3

```typescript
import RNFS from 'react-native-fs';
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

const compressFolder = async (
  sourceDir: string,
  targetBitrate = '192k'
) => {
  const files = await RNFS.readDir(sourceDir);
  const flacs = files.filter(f => f.name.endsWith('.flac'));

  const results = await Promise.allSettled(
    flacs.map(async (file) => {
      const output = file.path.replace('.flac', '.mp3');
      await AudioFFmpeg.convert(file.path, output, `-b:a ${targetBitrate}`);
      const stat = await RNFS.stat(output);
      return { name: file.name, sizeKB: Math.round(Number(stat.size) / 1024) };
    })
  );

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`✅ ${flacs[i].name} → ${r.value.sizeKB} KB`);
    } else {
      console.error(`❌ ${flacs[i].name}:`, r.reason.message);
    }
  });
};
```

---

### Live progress with ETA

```typescript
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';

const convertWithETA = async (
  input:       string,
  output:      string,
  durationMs:  number,  // total duration of the input file in ms
  onUpdate:    (pct: number, etaSec: number) => void
) => {
  const start = Date.now();

  await AudioFFmpeg.runAsync(
    `-i "${input}" -b:a 192k "${output}"`,
    {
      onProgress: (e) => {
        const pct     = Math.min(e.time / durationMs, 1);
        const elapsed = (Date.now() - start) / 1000;
        const etaSec  = pct > 0 ? (elapsed / pct) * (1 - pct) : 0;
        onUpdate(pct, Math.round(etaSec));
      },
    }
  );
};

// Usage
await convertWithETA(
  '/path/input.flac',
  '/path/output.mp3',
  180_000,  // 3-minute file
  (pct, eta) => {
    console.log(`${(pct * 100).toFixed(1)}% — ETA: ${eta}s`);
  }
);
```

---

## 7. Permissions Setup

FFmpeg writes to the filesystem — your app needs storage permissions before calling any method.

### Android (`android/app/src/main/AndroidManifest.xml`)

```xml
<!-- Already included in the library's AndroidManifest. Add to your APP manifest too: -->
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />          <!-- API 33+ -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
  android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
  android:maxSdkVersion="28" />
```

### Request at runtime

```typescript
import { PermissionsAndroid, Platform } from 'react-native';

const requestStoragePermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  // Android 13+ uses granular media permissions
  if (Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  // Android 10–12
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  ]);

  return (
    result['android.permission.READ_EXTERNAL_STORAGE']  === 'granted' &&
    result['android.permission.WRITE_EXTERNAL_STORAGE'] === 'granted'
  );
};

// Use before any FFmpeg operation
const canRun = await requestStoragePermissions();
if (!canRun) {
  alert('Storage permission required');
  return;
}

await AudioFFmpeg.convert('/sdcard/Music/song.flac', '/sdcard/Music/song.mp3');
```

### iOS (`Info.plist`)

iOS doesn't need explicit permissions for files in the app's sandbox (`DocumentDirectory`, `CachesDirectory`).  
If reading from the user's Music library, add:

```xml
<key>NSAppleMusicUsageDescription</key>
<string>Required to process audio files from your Music library</string>
```

---

## Quick Reference

| Method | What it does | Returns |
|---|---|---|
| `run(cmd)` | Any FFmpeg command | `Promise<AudioSession>` |
| `runAsync(cmd, cb)` | Any command with live events | `Promise<string>` (sessionId) |
| `cancel(id)` | Stop a running session | `Promise<void>` |
| `merge(inputs, out)` | Concatenate audio files | `Promise<AudioSession>` |
| `convert(in, out, opts?)` | Convert format | `Promise<AudioSession>` |
| `trim(in, out, start, end)` | Cut to time range | `Promise<AudioSession>` |
| `changeBitrate(in, out, br)` | Re-encode at new bitrate | `Promise<AudioSession>` |
| `changeSpeed(in, out, speed)` | Change playback speed | `Promise<AudioSession>` |
| `changeVolume(in, out, vol)` | Adjust volume | `Promise<AudioSession>` |
| `mix(in1, in2, out, opts?)` | Overlay two tracks | `Promise<AudioSession>` |
| `normalize(in, out)` | EBU R128 loudness | `Promise<AudioSession>` |
| `onLog(cb)` | Subscribe to log lines | `EmitterSubscription` |
| `onProgress(cb)` | Subscribe to progress | `EmitterSubscription` |
| `onComplete(cb)` | Subscribe to completion | `EmitterSubscription` |
| `getVersion()` | FFmpegKit version | `string` (sync) |
