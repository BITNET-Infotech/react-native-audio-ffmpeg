/**
 * AudioFFmpeg.ts — Public JS/TS API
 *
 * Universal audio processing. No format or codec restrictions —
 * any format FFmpegKit's audio build supports works here:
 * MP3, AAC, FLAC, OGG, OPUS, WAV, AIFF, ALAC, M4A, AC3, DTS,
 * WMA, APE, AMR-NB, AMR-WB, and more.
 *
 * Core: AudioFFmpeg.run(command) — pass any FFmpeg argument string.
 * Helpers: typed wrappers around the core for common operations.
 */

import { NativeEventEmitter } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import type { Spec } from './NativeAudioFFmpeg';

// ─── Lazy native module loader ────────────────────────────────────────────────
//
// WHY dynamic require instead of a top-level import?
//
// The codegen spec file (NativeAudioFFmpeg.ts) calls getEnforcing() at the
// module's top level. A static `import` evaluates that file immediately when
// AudioFFmpeg.ts is first imported — before the native binary is ready —
// causing a crash with "could not be found".
//
// A dynamic require() defers evaluation to the first actual method call,
// giving the native side time to register and letting us show a clear
// error message instead of a cryptic crash.

let _native: Spec | null = null;

function Native(): Spec {
  if (_native) return _native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _native = require('./NativeAudioFFmpeg').default as Spec;
    return _native!;
  } catch {
    throw new Error(
      '[@bitnet-infotech/react-native-audio-ffmpeg] Native module "NativeAudioFFmpeg" not found.\n\n' +
      'Steps to fix:\n' +
      '  1. yarn add @bitnet-infotech/react-native-audio-ffmpeg  (must be in node_modules)\n' +
      '  2. Android: cd android && ./gradlew clean && cd .. && npx react-native run-android\n' +
      '  3. iOS: cd ios && pod install && cd .. && npx react-native run-ios\n' +
      '  4. Confirm newArchEnabled=true in android/gradle.properties\n' +
      '  5. Fallback: add AudioFFmpegPackage() manually in MainApplication.kt'
    );
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AudioSession {
  /** 0 = success */
  returnCode: number;
  /** Full FFmpeg log output */
  output: string;
  /** Execution time in ms */
  duration: number;
}

export interface AudioProgressEvent {
  sessionId: string;
  /** Current position in the output file (ms) */
  time: number;
  /** Output file size so far (bytes) */
  size: number;
  /** Current encoding bitrate (kb/s) */
  bitrate: number;
  /** Processing speed relative to realtime (1.0 = realtime) */
  speed: number;
}

export interface AudioLogEvent {
  sessionId: string;
  line: string;
}

export interface AudioCompleteEvent {
  sessionId: string;
  returnCode: number;
  output: string;
}

// ─── Codec map ───────────────────────────────────────────────────────────
// Explicit encoder flags per output extension.
//
// ⚠️  ffmpeg-mobile-min is LGPL-only. GPL encoders (libmp3lame) are NOT
//     included. However, both Android and iOS native modules intercept
//     commands targeting .mp3 outputs and perform a two-step encoding:
//     1. FFmpeg decode -> PCM WAV
//     2. Native LAME C-library -> MP3
//
//   MP3  → libmp3lame (Intercepted and handled by native LAME libraries)
//   AAC  → aac       (FFmpeg native AAC encoder, LGPL)
//   OGG  → libvorbis (LGPL)
//   OPUS → libopus   (BSD)
//   FLAC → flac      (LGPL)
//   WAV  → pcm_s16le (uncompressed, no encoder license needed)
const CODEC_FLAGS: Record<string, string> = {
  mp3:  '-c:a libmp3lame',
  ogg:  '-c:a libvorbis',
  opus: '-c:a libopus',
  m4a:  '-c:a aac',
  aac:  '-c:a aac',
  flac: '-c:a flac',
  wav:  '-c:a pcm_s16le',
};

function codecFlagsFor(output: string): string {
  const ext = output.split('.').pop()?.toLowerCase() ?? '';
  return CODEC_FLAGS[ext] ?? '';
}

// ─── NativeEventEmitter (lazy init) ──────────────────────────────────────────
//
// ⚠️  New Architecture (Turbo Modules) does NOT populate NativeModules.
//     NativeModules.NativeAudioFFmpeg is always `undefined` in New Arch,
//     so passing it to NativeEventEmitter means addListener: is never called
//     natively → _listenerCount stays 0 → RCTEventEmitter silently drops ALL
//     events (sendEventWithName: has an early-out guard: if (_listenerCount>0)).
//
//     Fix: pass Native() — the actual TurboModule instance — which correctly
//     bridges addListener: / removeListeners: to increment _listenerCount.

let _emitter: NativeEventEmitter | null = null;
function getEmitter(): NativeEventEmitter {
  if (!_emitter) {
    // Native() is the TurboModule reference — works in both Old & New Arch.
    // It correctly calls the native addListener: method so _listenerCount > 0.
    _emitter = new NativeEventEmitter(Native() as any);
  }
  return _emitter;
}

// ─── Session ID generator ─────────────────────────────────────────────────────

let _counter = 0;
const newSessionId = () => `audio_${Date.now()}_${++_counter}`;

// ─── AudioFFmpeg class ────────────────────────────────────────────────────────

export class AudioFFmpeg {

  // ══ Core ══════════════════════════════════════════════════════════════════

  /**
   * Run any FFmpeg command and wait for completion.
   * This is the universal entry point — every helper below calls this.
   *
   * @param command  Full FFmpeg args string (without "ffmpeg" prefix)
   *
   * @example
   * // Any valid FFmpeg audio command:
   * await AudioFFmpeg.run('-i /in.flac -ab 320k /out.mp3');
   * await AudioFFmpeg.run('-i /in.m4a -c:a libopus -b:a 128k /out.opus');
   * await AudioFFmpeg.run('-i /in.wav -af "volume=2.0" /out.wav');
   */
  static async run(command: string): Promise<AudioSession> {
    return Native().execute(command);
  }

  /**
   * Run any FFmpeg command with live callbacks.
   * Returns a sessionId for cancellation.
   *
   * @example
   * const id = await AudioFFmpeg.runAsync('-i /in.wav /out.mp3', {
   *   onProgress: (p) => setProgress(p.speed),
   *   onComplete: (e) => console.log('done', e.returnCode),
   * });
   * // To cancel:
   * await AudioFFmpeg.cancel(id);
   */
  static async runAsync(
    command: string,
    callbacks?: {
      onLog?:      (e: AudioLogEvent)      => void;
      onProgress?: (e: AudioProgressEvent) => void;
      onComplete?: (e: AudioCompleteEvent) => void;
    }
  ): Promise<string> {
    const sessionId = newSessionId();
    const emitter   = getEmitter();
    const subs: EmitterSubscription[] = [];

    if (callbacks?.onLog) {
      subs.push(emitter.addListener('AudioFFmpegLog', (e: AudioLogEvent) => {
        if (e.sessionId === sessionId) callbacks.onLog!(e);
      }));
    }
    if (callbacks?.onProgress) {
      subs.push(emitter.addListener('AudioFFmpegProgress', (e: AudioProgressEvent) => {
        if (e.sessionId === sessionId) callbacks.onProgress!(e);
      }));
    }
    if (callbacks?.onComplete) {
      subs.push(emitter.addListener('AudioFFmpegComplete', (e: AudioCompleteEvent) => {
        if (e.sessionId === sessionId) {
          callbacks.onComplete!(e);
          subs.forEach(s => s.remove()); // auto-cleanup
        }
      }));
    }

    await Native().executeAsync(command, sessionId);
    return sessionId;
  }

  /** Cancel a running runAsync session */
  static cancel(sessionId: string): Promise<void> {
    return Native().cancel(sessionId);
  }

  // ══ Helpers ════════════════════════════════════════════════════════════════

  /**
   * Merge (concatenate) multiple audio files into one.
   *
   * Any mix of input formats works. Output format = output file extension.
   * Files are joined in the order provided.
   *
   * @example
   * await AudioFFmpeg.merge(['/a.mp3', '/b.mp3'], '/out.mp3');
   * await AudioFFmpeg.merge(['/a.flac', '/b.ogg', '/c.aac'], '/out.flac');
   * await AudioFFmpeg.merge(['/part1.wav', '/part2.wav'], '/full.m4a');
   */
  static merge(inputs: string[], output: string): Promise<AudioSession> {
    if (inputs.length < 2) {
      return Promise.reject(new Error('merge() needs at least 2 input files'));
    }
    const inputArgs     = inputs.map(p => `-i "${p}"`).join(' ');
    const filterSources = inputs.map((_, i) => `[${i}:a]`).join('');
    const filter        = `${filterSources}concat=n=${inputs.length}:v=0:a=1[aout]`;
    const codec         = codecFlagsFor(output);
    return Native().execute(
      `${inputArgs} -filter_complex "${filter}" -map [aout] ${codec} -y "${output}"`
    );
  }

  /**
   * Convert any audio file to any other audio format.
   * Output format is determined by the output file extension.
   *
   * Pass `options` to add any extra FFmpeg flags for full codec control.
   *
   * @example
   * // Simple format conversion:
   * await AudioFFmpeg.convert('/in.wav',  '/out.mp3');
   * await AudioFFmpeg.convert('/in.flac', '/out.aac');
   * await AudioFFmpeg.convert('/in.m4a',  '/out.opus');
   *
   * // With custom flags:
   * await AudioFFmpeg.convert('/in.wav', '/out.mp3',  '-q:a 0');          // VBR best quality
   * await AudioFFmpeg.convert('/in.wav', '/out.opus', '-b:a 128k -vbr on');
   * await AudioFFmpeg.convert('/in.mp3', '/out.flac', '-c:a flac -compression_level 8');
   */
  static convert(
    input: string,
    output: string,
    options = ''
  ): Promise<AudioSession> {
    const codec = options ? '' : codecFlagsFor(output);
    return Native().execute(
      `-i "${input}" -vn ${codec} ${options} -y "${output}"`
    );
  }


  // ══ Event subscriptions ════════════════════════════════════════════════════

  /** Subscribe to log lines from any running async session */
  static onLog(cb: (e: AudioLogEvent) => void): EmitterSubscription {
    return getEmitter().addListener('AudioFFmpegLog', cb);
  }

  /** Subscribe to progress events from any running async session */
  static onProgress(cb: (e: AudioProgressEvent) => void): EmitterSubscription {
    return getEmitter().addListener('AudioFFmpegProgress', cb);
  }

  /** Subscribe to completion events */
  static onComplete(cb: (e: AudioCompleteEvent) => void): EmitterSubscription {
    return getEmitter().addListener('AudioFFmpegComplete', cb);
  }

  // ══ Info ═══════════════════════════════════════════════════════════════════

  /** Returns the FFmpegKit native library version */
  static getVersion(): string {
    return Native().getVersion();
  }


}

export default AudioFFmpeg;
