import Foundation
import ffmpegkit

/**
 * AudioFFmpegImpl — Swift core implementation.
 *
 * Separated from ObjC++ because React Native Codegen outputs C++ headers
 * that Swift cannot import directly. The ObjC++ bridge (AudioFFmpeg.mm)
 * calls into this Swift class and relays events back to JS.
 *
 * All FFmpegKit calls are made here. @objc annotations expose
 * the methods to the ObjC++ bridge file.
 */
@objc public class AudioFFmpegImpl: NSObject {

    // Active async sessions: userStringId → native FFmpegSession
    private var sessions: [String: FFmpegSession] = [:]
    private let lock = NSLock()

    /**
     * Event callback set by the ObjC++ bridge.
     * Called with (eventName, eventBody) to forward events to JS.
     */
    @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

    /**
     * Block injected by ObjC++ bridge to perform LAME encoding (since Swift
     * cannot easily import the C lame library without a bridging header).
     * Returns true on success.
     */
    @objc public var encodeMp3: ((_ wavPath: String, _ mp3Path: String, _ bitrateKbps: Int, _ quality: Int) -> Bool)?


    // ─── execute() ────────────────────────────────────────────────────────────

    /**
     * Blocking execute. Runs FFmpegKit on a background thread.
     * Calls resolve(result) or reject(code, message) when done.
     */
    @objc public func execute(
        _ command: String,
        resolve: @escaping ([String: Any]) -> Void,
        reject:  @escaping (_ code: String, _ message: String) -> Void
    ) {
        if let mp3Out = extractMp3OutputPath(command) {
            let result = executeWithMp3Encoding(command, mp3Out: mp3Out)
            if let rc = result["returnCode"] as? Int, rc == 0 {
                resolve(result)
            } else {
                reject("AUDIO_FFMPEG_ERROR", (result["output"] as? String) ?? "MP3 encode failed")
            }
            return
        }

        guard let session = FFmpegKit.execute(command) else {
            reject("AUDIO_FFMPEG_ERROR", "Failed to create FFmpeg session")
            return
        }

        let rc       = session.getReturnCode()
        let rcValue  = rc?.getValue() ?? -1
        let output   = session.getAllLogsAsString() ?? ""
        let duration = Int(session.getDuration())

        if ReturnCode.isSuccess(rc) {
            resolve(["returnCode": Int(rcValue), "output": output, "duration": duration])
        } else {
            reject("AUDIO_FFMPEG_ERROR", "FFmpeg exited with code \(rcValue)")
        }
    }

    // ─── executeAsync() ───────────────────────────────────────────────────────

    /**
     * Non-blocking execute with live event streaming.
     * Events fired via onEvent → ObjC++ bridge → JS NativeEventEmitter:
     *
     *   AudioFFmpegLog      → { sessionId, line }
     *   AudioFFmpegProgress → { sessionId, time, size, bitrate, speed }
     *   AudioFFmpegComplete → { sessionId, returnCode, output }
     */
    @objc public func executeAsync(
        _ command: String,
        sessionId: String,
        resolve: @escaping () -> Void,
        reject:  @escaping (_ code: String, _ message: String) -> Void
    ) {
        if let mp3Out = extractMp3OutputPath(command) {
            resolve() // resolve immediately so JS gets the sessionId
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                guard let self = self else { return }
                let result = self.executeWithMp3Encoding(command, mp3Out: mp3Out)
                self.onEvent?("AudioFFmpegComplete", [
                    "sessionId":  sessionId,
                    "returnCode": result["returnCode"] ?? -1,
                    "output":     result["output"] ?? ""
                ])
            }
            return
        }

        // ffmpeg-mobile-min 6.x returns a non-optional FFmpegSession
        let nativeSession = FFmpegKit.executeAsync(
            command,

            // ① Complete
            withCompleteCallback: { [weak self] s in
                guard let self, let s else { return }
                let rc = s.getReturnCode()
                self.onEvent?("AudioFFmpegComplete", [
                    "sessionId":  sessionId,
                    "returnCode": Int(rc?.getValue() ?? -1),
                    "output":     s.getAllLogsAsString() ?? ""
                ])
                self.lock.lock()
                self.sessions.removeValue(forKey: sessionId)
                self.lock.unlock()
            },

            // ② Log line
            withLogCallback: { [weak self] log in
                guard let self, let log else { return }
                self.onEvent?("AudioFFmpegLog", [
                    "sessionId": sessionId,
                    "line":      log.getMessage() ?? ""
                ])
            },

            // ③ Statistics (progress)
            withStatisticsCallback: { [weak self] stats in
                guard let self, let stats else { return }
                self.onEvent?("AudioFFmpegProgress", [
                    "sessionId": sessionId,
                    "time":      stats.getTime(),
                    "size":      stats.getSize(),
                    "bitrate":   stats.getBitrate(),
                    "speed":     stats.getSpeed()
                ])
            }
        )

        if let s = nativeSession {
            lock.lock()
            sessions[sessionId] = s
            lock.unlock()
            resolve()
        } else {
            reject("AUDIO_FFMPEG_ERROR", "Failed to start async FFmpeg session")
        }
    }

    // ─── cancel() ─────────────────────────────────────────────────────────────

    @objc public func cancel(_ sessionId: String) {
        lock.lock()
        let session = sessions[sessionId]
        lock.unlock()
        session?.cancel()
    }

    // ─── getVersion() ─────────────────────────────────────────────────────────

    @objc public func getVersion() -> String {
        return FFmpegKitConfig.getVersion() ?? "unknown"
    }

    // ─── MP3 two-step encoding ─────────────────────────────────────────────────

    private func extractMp3OutputPath(_ command: String) -> String? {
        let pattern = "-y\\s+(?:\"([^\"]+\\.mp3)\"|(\\S+\\.mp3))"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let nsString = command as NSString
        let results = regex.matches(in: command, range: NSRange(location: 0, length: nsString.length))
        
        for match in results {
            if match.range(at: 1).location != NSNotFound {
                return nsString.substring(with: match.range(at: 1))
            } else if match.range(at: 2).location != NSNotFound {
                return nsString.substring(with: match.range(at: 2))
            }
        }
        return nil
    }

    private func executeWithMp3Encoding(_ command: String, mp3Out: String) -> [String: Any] {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!.path
        let wavTemp = "\(cacheDir)/tmp_mp3_\(Date().timeIntervalSince1970).wav"
        let mp3BitrateKbps = extractAudioBitrateKbps(command) ?? 128
        let mp3Quality = min(max(extractAudioQuality(command) ?? 3, 0), 9)

        // Replace mp3 output with wav output
        var wavCommand = command
        do {
            let regex1 = try NSRegularExpression(pattern: "(-y\\s+)\"([^\"]+\\.mp3)\"")
            wavCommand = regex1.stringByReplacingMatches(in: wavCommand, range: NSRange(wavCommand.startIndex..., in: wavCommand), withTemplate: "$1\"\(wavTemp)\"")
            
            let regex2 = try NSRegularExpression(pattern: "(-y\\s+)(\\S+\\.mp3)")
            wavCommand = regex2.stringByReplacingMatches(in: wavCommand, range: NSRange(wavCommand.startIndex..., in: wavCommand), withTemplate: "$1\(wavTemp)")
            
            let regexCodec = try NSRegularExpression(pattern: "-c:a\\s+\\S+")
            wavCommand = regexCodec.stringByReplacingMatches(in: wavCommand, range: NSRange(wavCommand.startIndex..., in: wavCommand), withTemplate: "")
            
            wavCommand = wavCommand.trimmingCharacters(in: .whitespaces) + " -c:a pcm_s16le"
        } catch {
            return ["returnCode": -1, "output": "Regex error", "duration": 0]
        }

        let startTime = Date().timeIntervalSince1970
        guard let ffmpegSession = FFmpegKit.execute(wavCommand) else {
            return ["returnCode": -1, "output": "Failed to create FFmpeg session for WAV", "duration": 0]
        }
        let ffmpegDuration = Int((Date().timeIntervalSince1970 - startTime) * 1000)

        let rc = ffmpegSession.getReturnCode()
        if !ReturnCode.isSuccess(rc) {
            return [
                "returnCode": Int(rc?.getValue() ?? -1),
                "output": ffmpegSession.getAllLogsAsString() ?? "",
                "duration": ffmpegDuration
            ]
        }

        // Encode WAV to MP3 using LAME block injected from ObjC++
        let lameStart = Date().timeIntervalSince1970
        var encodeSuccess = false
        if let encodeMp3 = self.encodeMp3 {
            encodeSuccess = encodeMp3(wavTemp, mp3Out, mp3BitrateKbps, mp3Quality)
        }
        let totalDuration = ffmpegDuration + Int((Date().timeIntervalSince1970 - lameStart) * 1000)

        // Delete temp WAV
        try? FileManager.default.removeItem(atPath: wavTemp)

        if encodeSuccess {
            return ["returnCode": 0, "output": "MP3 encoding complete", "duration": totalDuration]
        } else {
            return ["returnCode": -1, "output": "LAME MP3 encoding failed", "duration": totalDuration]
        }
    }

    private func extractAudioBitrateKbps(_ command: String) -> Int? {
        guard let regex = try? NSRegularExpression(pattern: "-b:a\\s+(\\d+)k\\b", options: [.caseInsensitive]) else {
            return nil
        }
        let nsString = command as NSString
        guard let match = regex.firstMatch(in: command, range: NSRange(location: 0, length: nsString.length)) else {
            return nil
        }
        let bitrateRange = match.range(at: 1)
        guard bitrateRange.location != NSNotFound else { return nil }
        return Int(nsString.substring(with: bitrateRange))
    }

    private func extractAudioQuality(_ command: String) -> Int? {
        guard let regex = try? NSRegularExpression(pattern: "-q:a\\s+([0-9]+)\\b", options: [.caseInsensitive]) else {
            return nil
        }
        let nsString = command as NSString
        guard let match = regex.firstMatch(in: command, range: NSRange(location: 0, length: nsString.length)) else {
            return nil
        }
        let qualityRange = match.range(at: 1)
        guard qualityRange.location != NSNotFound else { return nil }
        return Int(nsString.substring(with: qualityRange))
    }
}
