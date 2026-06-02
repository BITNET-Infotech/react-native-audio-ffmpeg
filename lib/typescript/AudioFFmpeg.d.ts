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
import type { EmitterSubscription } from 'react-native';
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
export interface AudioConvertOptions {
    /** Resample output audio (Hz), e.g. 44100, 48000 */
    sampleRate?: number;
    /** Output bitrate in kbps, e.g. 96, 128, 192, 320 */
    bitrate?: number;
    /** Output channel count: 1 (mono), 2 (stereo) */
    channels?: 1 | 2;
    /**
     * Codec quality hint.
     * - For MP3 this maps to LAME quality (0 best, 9 fastest).
     * - For other codecs this maps to FFmpeg `-q:a`.
     */
    quality?: number;
    /** Extra raw FFmpeg args (advanced users), appended last. */
    ffmpegArgs?: string;
}
export declare class AudioFFmpeg {
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
    static run(command: string): Promise<AudioSession>;
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
    static runAsync(command: string, callbacks?: {
        onLog?: (e: AudioLogEvent) => void;
        onProgress?: (e: AudioProgressEvent) => void;
        onComplete?: (e: AudioCompleteEvent) => void;
    }): Promise<string>;
    /** Cancel a running runAsync session */
    static cancel(sessionId: string): Promise<void>;
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
    static merge(inputs: string[], output: string): Promise<AudioSession>;
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
     *
     * // Typed options:
     * await AudioFFmpeg.convert('/in.wav', '/out.mp3', {
     *   sampleRate: 48000,
     *   bitrate: 192,
     *   channels: 2,
     *   quality: 2,
     * });
     */
    static convert(input: string, output: string, options?: string | AudioConvertOptions): Promise<AudioSession>;
    /** Subscribe to log lines from any running async session */
    static onLog(cb: (e: AudioLogEvent) => void): EmitterSubscription;
    /** Subscribe to progress events from any running async session */
    static onProgress(cb: (e: AudioProgressEvent) => void): EmitterSubscription;
    /** Subscribe to completion events */
    static onComplete(cb: (e: AudioCompleteEvent) => void): EmitterSubscription;
    /** Returns the FFmpegKit native library version */
    static getVersion(): string;
}
export default AudioFFmpeg;
//# sourceMappingURL=AudioFFmpeg.d.ts.map