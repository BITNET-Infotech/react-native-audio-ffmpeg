#import "AudioFFmpegLame.h"
#import <lame/lame.h>

@implementation AudioFFmpegLame

+ (BOOL)encodeWavFile:(NSString *)wavPath toMp3File:(NSString *)mp3Path error:(NSError **)error {
    FILE *wavFile = fopen([wavPath UTF8String], "rb");
    if (!wavFile) {
        if (error) *error = [NSError errorWithDomain:@"AudioFFmpegLame" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"Failed to open WAV file"}];
        return NO;
    }

    // Read 44 bytes of standard WAV header
    unsigned char header[44];
    if (fread(header, 1, 44, wavFile) != 44) {
        fclose(wavFile);
        if (error) *error = [NSError errorWithDomain:@"AudioFFmpegLame" code:-2 userInfo:@{NSLocalizedDescriptionKey: @"Invalid WAV header size"}];
        return NO;
    }

    // Extract properties (little-endian)
    int numChannels = header[22] | (header[23] << 8);
    int sampleRate = header[24] | (header[25] << 8) | (header[26] << 16) | (header[27] << 24);
    int bitsPerSample = header[34] | (header[35] << 8);

    if (bitsPerSample != 16) {
        fclose(wavFile);
        if (error) *error = [NSError errorWithDomain:@"AudioFFmpegLame" code:-3 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"Expected 16-bit PCM WAV, got %d-bit", bitsPerSample]}];
        return NO;
    }

    FILE *mp3File = fopen([mp3Path UTF8String], "wb");
    if (!mp3File) {
        fclose(wavFile);
        if (error) *error = [NSError errorWithDomain:@"AudioFFmpegLame" code:-4 userInfo:@{NSLocalizedDescriptionKey: @"Failed to create MP3 file"}];
        return NO;
    }

    lame_t lame = lame_init();
    lame_set_in_samplerate(lame, sampleRate);
    lame_set_num_channels(lame, numChannels);
    lame_set_out_samplerate(lame, sampleRate);
    lame_set_brate(lame, 128); // 128 kbps by default
    lame_set_quality(lame, 3);
    lame_init_params(lame);

    const int CHUNK = 8192;
    int read_bytes = 0;
    int write_bytes = 0;
    
    // 16-bit means 2 bytes per sample. For interleaved, total buffer size is CHUNK * numChannels.
    short int pcm_buffer[CHUNK * numChannels];
    unsigned char mp3_buffer[(int)(CHUNK * numChannels * 1.25 + 7200)];

    while ((read_bytes = (int)fread(pcm_buffer, sizeof(short int), CHUNK * numChannels, wavFile)) > 0) {
        int num_samples = read_bytes / numChannels;
        if (numChannels == 2) {
            write_bytes = lame_encode_buffer_interleaved(lame, pcm_buffer, num_samples, mp3_buffer, sizeof(mp3_buffer));
        } else {
            write_bytes = lame_encode_buffer(lame, pcm_buffer, pcm_buffer, num_samples, mp3_buffer, sizeof(mp3_buffer));
        }
        if (write_bytes > 0) {
            fwrite(mp3_buffer, 1, write_bytes, mp3File);
        }
    }

    write_bytes = lame_encode_flush(lame, mp3_buffer, sizeof(mp3_buffer));
    if (write_bytes > 0) {
        fwrite(mp3_buffer, 1, write_bytes, mp3File);
    }

    lame_close(lame);
    fclose(mp3File);
    fclose(wavFile);

    return YES;
}

@end
