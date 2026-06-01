/**
 * react-native.config.js
 *
 * Tells React Native's autolinking where to find the native code.
 *
 * WHY packageImportPath and packageInstance are required:
 * React Native's autolinking tool scans node_modules for this file.
 * It generates PackageList.java (Android) and reads the podspec (iOS).
 * Without packageImportPath + packageInstance, Android autolinking
 * silently skips the package → the Turbo Module is never registered →
 * you get "NativeAudioFFmpeg could not be found" at runtime.
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        // These two fields are what RN's autolinking uses to generate
        // the PackageList.java entry. Both are required.
        packageImportPath: 'import com.audioffmpeg.AudioFFmpegPackage;',
        packageInstance:   'new AudioFFmpegPackage()',
      },
      // iOS: no config needed — autolinking finds the podspec automatically
      // by scanning for *.podspec files in the package root.
    },
  },
};
