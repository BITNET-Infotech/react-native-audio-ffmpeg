package com.audioffmpeg

import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.ReturnCode
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.naman14.androidlame.AndroidLame
import com.naman14.androidlame.LameBuilder
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap

/**
 * AudioFFmpegModule — Turbo Module implementation (Android / Kotlin)
 *
 * Wraps FFmpegKit + TAndroidLame. Exposes:
 *   execute()      → blocking FFmpeg run, resolves with AudioSession
 *   executeAsync() → non-blocking with live events streamed to JS
 *   cancel()       → cancel a running executeAsync session
 *   getVersion()   → FFmpegKit version string (synchronous)
 *
 * MP3 encoding is handled via a two-step pipeline:
 *   1. FFmpeg decodes any input → temp PCM WAV (ffmpeg-kit-min supports this)
 *   2. TAndroidLame encodes WAV PCM → MP3 (real libmp3lame, via JNI)
 */
class AudioFFmpegModule(reactContext: ReactApplicationContext) :
    NativeAudioFFmpegSpec(reactContext) {

    /** userSessionId → FFmpegKit native session ID (for cancel support) */
    private val activeSessions = ConcurrentHashMap<String, Long>()

    override fun getName(): String = NAME

    // ─── execute() ─────────────────────────────────────────────────────────────

    override fun execute(command: String, promise: Promise) {
        try {
            // Detect MP3 output path in command and reroute through LAME
            val mp3Out = extractMp3OutputPath(command)
            if (mp3Out != null) {
                val result = executeWithMp3Encoding(command, mp3Out)
                promise.resolve(result)
                return
            }

            val session = FFmpegKit.execute(command)
            promise.resolve(buildResult(
                returnCode = session.returnCode?.value ?: -1,
                output     = session.allLogsAsString ?: "",
                duration   = session.duration
            ))
        } catch (e: Exception) {
            promise.reject("AUDIO_FFMPEG_EXCEPTION", e.message ?: "Unknown error")
        }
    }

    // ─── executeAsync() ────────────────────────────────────────────────────────

    override fun executeAsync(command: String, sessionId: String, promise: Promise) {
        try {
            // MP3 output: run two-step pipeline on a background thread, stream events manually
            val mp3Out = extractMp3OutputPath(command)
            if (mp3Out != null) {
                promise.resolve(null) // resolve immediately so JS gets the sessionId
                Thread {
                    try {
                        val result = executeWithMp3Encoding(command, mp3Out)
                        emitEvent("AudioFFmpegComplete", Arguments.createMap().apply {
                            putString("sessionId", sessionId)
                            putInt("returnCode",   result.getInt("returnCode"))
                            putString("output",    result.getString("output") ?: "")
                        })
                    } catch (e: Exception) {
                        emitEvent("AudioFFmpegComplete", Arguments.createMap().apply {
                            putString("sessionId", sessionId)
                            putInt("returnCode",   -1)
                            putString("output",    e.message ?: "Unknown error")
                        })
                    }
                }.start()
                return
            }

            val nativeSession = FFmpegKit.executeAsync(
                command,
                { done ->
                    emitEvent("AudioFFmpegComplete", Arguments.createMap().apply {
                        putString("sessionId",  sessionId)
                        putInt("returnCode",     done.returnCode?.value ?: -1)
                        putString("output",      done.allLogsAsString ?: "")
                    })
                    activeSessions.remove(sessionId)
                },
                { log ->
                    emitEvent("AudioFFmpegLog", Arguments.createMap().apply {
                        putString("sessionId", sessionId)
                        putString("line",      log.message ?: "")
                    })
                },
                { stats ->
                    emitEvent("AudioFFmpegProgress", Arguments.createMap().apply {
                        putString("sessionId", sessionId)
                        putDouble("time",      stats.time.toDouble())
                        putDouble("size",      stats.size.toDouble())
                        putDouble("bitrate",   stats.bitrate)
                        putDouble("speed",     stats.speed)
                    })
                }
            )

            if (nativeSession != null) {
                activeSessions[sessionId] = nativeSession.sessionId
                promise.resolve(null)
            } else {
                promise.reject("AUDIO_FFMPEG_ERROR", "Failed to start session")
            }
        } catch (e: Exception) {
            promise.reject("AUDIO_FFMPEG_EXCEPTION", e.message ?: "Unknown error")
        }
    }

    // ─── cancel() ──────────────────────────────────────────────────────────────

    override fun cancel(sessionId: String, promise: Promise) {
        activeSessions[sessionId]?.let { nativeId ->
            FFmpegKitConfig.getSession(nativeId)?.cancel()
            activeSessions.remove(sessionId)
        }
        promise.resolve(null)
    }

    // ─── getVersion() ──────────────────────────────────────────────────────────

    override fun getVersion(): String =
        try { FFmpegKitConfig.getVersion() ?: "6.0.1" }
        catch (_: Exception) { "6.0.1" }

    // ─── Events ────────────────────────────────────────────────────────────────
    
    override fun addListener(eventName: String) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    override fun removeListeners(count: Double) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    // ─── MP3 two-step encoding ─────────────────────────────────────────────────

    /**
     * If the FFmpeg command targets an .mp3 output file, extract that path.
     * Matches the last -y "...path.mp3" or -y /path.mp3 in the command.
     */
    private fun extractMp3OutputPath(command: String): String? {
        // Match: -y "path.mp3"  or  -y path.mp3
        val quoted   = Regex("""-y\s+"([^"]+\.mp3)"""").find(command)
        val unquoted = Regex("""-y\s+(\S+\.mp3)""").find(command)
        return (quoted?.groupValues?.get(1) ?: unquoted?.groupValues?.get(1))
    }

    /**
     * Two-step MP3 pipeline:
     *  1. Replace .mp3 output with a temp .wav path and run FFmpeg → PCM WAV
     *  2. Encode WAV PCM → MP3 using TAndroidLame (real libmp3lame)
     *  3. Delete temp WAV
     */
    private fun executeWithMp3Encoding(command: String, mp3Out: String): WritableMap {
        val cacheDir = reactApplicationContext.cacheDir.absolutePath
        val wavTemp  = "$cacheDir/tmp_mp3_${System.currentTimeMillis()}.wav"

        try {
            // Step 1 — FFmpeg decode → PCM WAV (s16le, keep original sample rate & channels)
            val wavCommand = command
                .replace(Regex("""(-y\s+)"([^"]+\.mp3)""""))  { m ->
                    "${m.groupValues[1]}\"$wavTemp\""
                }
                .replace(Regex("""(-y\s+)(\S+\.mp3)""")) { m ->
                    "${m.groupValues[1]}$wavTemp"
                }
                // Force PCM s16le output regardless of source codec flags
                .let { cmd ->
                    // Remove any -c:a flags the caller set, then add PCM
                    cmd.replace(Regex("""-c:a\s+\S+"""), "").trim() + " -c:a pcm_s16le"
                }

            val startTime = System.currentTimeMillis()
            val ffmpegSession = FFmpegKit.execute(wavCommand)
            val ffmpegDuration = System.currentTimeMillis() - startTime

            if (ffmpegSession.returnCode?.value != 0) {
                return buildResult(
                    returnCode = ffmpegSession.returnCode?.value ?: -1,
                    output     = ffmpegSession.allLogsAsString ?: "",
                    duration   = ffmpegDuration
                )
            }

            // Step 2 — Read WAV header, encode PCM → MP3 with LAME
            val lameStart = System.currentTimeMillis()
            encodePcmWavToMp3(wavTemp, mp3Out)
            val totalDuration = ffmpegDuration + (System.currentTimeMillis() - lameStart)

            return buildResult(returnCode = 0, output = "MP3 encoding complete", duration = totalDuration)

        } finally {
            File(wavTemp).delete()
        }
    }

    /**
     * Reads a PCM WAV file and encodes it to MP3 using TAndroidLame.
     */
    private fun encodePcmWavToMp3(wavPath: String, mp3Path: String) {
        FileInputStream(wavPath).use { fis ->
            FileOutputStream(mp3Path).use { fos ->

                // Parse WAV header (44 bytes standard RIFF/WAVE/fmt /data)
                val header = ByteArray(44)
                fis.read(header)

                val buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
                // Offset 22: numChannels, 24: sampleRate, 34: bitsPerSample
                val numChannels  = buf.getShort(22).toInt()
                val sampleRate   = buf.getInt(24)
                val bitsPerSample = buf.getShort(34).toInt()

                if (bitsPerSample != 16) {
                    throw IllegalStateException("Expected 16-bit PCM WAV, got ${bitsPerSample}-bit")
                }

                val lame: AndroidLame = LameBuilder()
                    .setInSampleRate(sampleRate)
                    .setOutChannels(numChannels)
                    .setOutBitrate(128)
                    .setOutSampleRate(sampleRate)
                    .setQuality(3)
                    .build()

                val CHUNK   = 8192        // samples per channel per chunk
                val bytesPerSample = 2    // 16-bit = 2 bytes
                val frameBytes = CHUNK * numChannels * bytesPerSample
                val pcmBuf  = ByteArray(frameBytes)
                val mp3Buf  = ByteArray(frameBytes)

                var bytesRead: Int
                while (fis.read(pcmBuf).also { bytesRead = it } > 0) {
                    val samples = bytesRead / (numChannels * bytesPerSample)
                    val shortBuf = ShortArray(bytesRead / 2)
                    ByteBuffer.wrap(pcmBuf, 0, bytesRead)
                        .order(ByteOrder.LITTLE_ENDIAN)
                        .asShortBuffer()
                        .get(shortBuf, 0, bytesRead / 2)

                    val encoded = lame.encodeBufferInterLeaved(shortBuf, samples, mp3Buf)
                    if (encoded > 0) fos.write(mp3Buf, 0, encoded)
                }

                val flushed = lame.flush(mp3Buf)
                if (flushed > 0) fos.write(mp3Buf, 0, flushed)
            }
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private fun buildResult(returnCode: Int, output: String, duration: Long): WritableMap =
        Arguments.createMap().apply {
            putInt("returnCode", returnCode)
            putString("output",  output)
            putDouble("duration", duration.toDouble())
        }

    private fun emitEvent(name: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, params)
    }

    companion object {
        const val NAME = "NativeAudioFFmpeg"
    }
}
