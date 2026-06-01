package com.audioffmpeg

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * AudioFFmpegPackage — registers the Turbo Module with React Native.
 *
 * React Native's autolinking discovers this class automatically by scanning
 * the library's build.gradle (via the `com.facebook.react` plugin).
 * You DO NOT need to add anything to MainApplication.kt/java in the host app.
 *
 * Uses TurboReactPackage (not ReactPackage) to enable the JSI/New Architecture path.
 */
class AudioFFmpegPackage : TurboReactPackage() {

    override fun getModule(name: String, ctx: ReactApplicationContext): NativeModule? =
        if (name == AudioFFmpegModule.NAME) AudioFFmpegModule(ctx) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(
            AudioFFmpegModule.NAME to ReactModuleInfo(
                /* name */                    AudioFFmpegModule.NAME,
                /* className */               AudioFFmpegModule.NAME,
                /* canOverrideExistingModule */false,
                /* needsEagerInit */          false,
                /* hasConstants */            true,
                /* isCxxModule */             false,
                /* isTurboModule */           true   // ← enables JSI / New Architecture
            )
        )
    }
}
