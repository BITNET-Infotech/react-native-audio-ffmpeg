#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AudioFFmpegLame : NSObject

/**
 * Encodes a standard 16-bit PCM WAV file to an MP3 file using LAME.
 */
+ (BOOL)encodeWavFile:(NSString *)wavPath
            toMp3File:(NSString *)mp3Path
          bitrateKbps:(int)bitrateKbps
              quality:(int)quality
                error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
