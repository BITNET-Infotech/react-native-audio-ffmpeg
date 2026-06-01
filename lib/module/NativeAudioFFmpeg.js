"use strict";

/**
 * NativeAudioFFmpeg.ts — Turbo Module Codegen Spec
 *
 * RULE: This file must contain EXACTLY ONE TurboModuleRegistry call.
 * The RN Codegen parser enforces this strictly — two calls = build failure.
 *
 * Do NOT add any lazy loading, helper functions, or extra
 * TurboModuleRegistry calls here. All of that lives in AudioFFmpeg.ts.
 */

import { TurboModuleRegistry } from 'react-native';
// ─── EXACTLY ONE call — codegen requirement ───────────────────────────────────
export default TurboModuleRegistry.getEnforcing('NativeAudioFFmpeg');
//# sourceMappingURL=NativeAudioFFmpeg.js.map