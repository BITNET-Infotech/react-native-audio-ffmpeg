/**
 * NativeAudioFFmpeg.ts — Turbo Module Codegen Spec
 *
 * RULE: This file must contain EXACTLY ONE TurboModuleRegistry call.
 * The RN Codegen parser enforces this strictly — two calls = build failure.
 *
 * Do NOT add any lazy loading, helper functions, or extra
 * TurboModuleRegistry calls here. All of that lives in AudioFFmpeg.ts.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface AudioSession {
  /** Exit code — 0 = success */
  returnCode: number;
  /** Full FFmpeg stdout + stderr */
  output: string;
  /** Execution time in milliseconds */
  duration: number;
}

export interface Spec extends TurboModule {
  /**
   * Execute any FFmpeg command string (everything after "ffmpeg").
   * Resolves with AudioSession on success, rejects on error.
   */
  execute(command: string): Promise<AudioSession>;

  /**
   * Execute asynchronously with live event streaming.
   * Events fired to JS via NativeEventEmitter:
   *   AudioFFmpegLog      → { sessionId, line }
   *   AudioFFmpegProgress → { sessionId, time, size, bitrate, speed }
   *   AudioFFmpegComplete → { sessionId, returnCode, output }
   */
  executeAsync(command: string, sessionId: string): Promise<void>;

  /** Cancel a running executeAsync session */
  cancel(sessionId: string): Promise<void>;

  /** Returns the FFmpegKit native library version (synchronous) */
  getVersion(): string;

  /**
   * Required for NativeEventEmitter to work in New Architecture (JSI / Turbo Modules).
   *
   * In New Architecture, only methods declared in this spec are exposed to JS.
   * Without these, NativeEventEmitter calls nativeModule.addListener() which
   * silently does nothing → RCTEventEmitter._listenerCount stays 0 → every
   * sendEventWithName:body: is silently dropped (early-out guard).
   *
   * RCTEventEmitter already implements both methods in ObjC — we just need
   * them declared here so codegen wires them through the JSI bridge.
   */
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// ─── EXACTLY ONE call — codegen requirement ───────────────────────────────────
export default TurboModuleRegistry.getEnforcing<Spec>('NativeAudioFFmpeg');
