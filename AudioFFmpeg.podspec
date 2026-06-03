require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "AudioFFmpeg"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.author       = { package["author"] => package["author"] }

  # iOS 15.1 — minimum required by React Native 0.76+.
  # Build with Xcode 16 + iOS 18 SDK (Apple requirement since April 2025).
  s.platforms    = { :ios => "15.1" }

  s.source       = { :git => package["repository"]["url"], :tag => "v#{s.version}" }

  # All source files including headers
  s.source_files = "ios/**/*.{h,m,mm,swift}"

  # Mark all headers as private so CocoaPods does NOT add them to the
  # framework's public module map. React Native headers like RCTTurboModule.h
  # and RCTEventEmitter.h are not modular and cause "could not build module"
  # errors if included in the umbrella header. This is the standard pattern
  # for all React Native library pods.
  s.private_header_files = "ios/**/*.h"

  # ⚠️  FFmpegKit (arthenica/ffmpeg-kit) was RETIRED on April 1, 2025.
  #     Binaries were pulled from CocoaPods on that date and the GitHub
  #     repo was archived on June 23, 2025.
  #
  # We use the community-maintained fork by maitrungduc1410, published
  # as the `ffmpeg-mobile-min` CocoaPod. The Objective-C/Swift API
  # (FFmpegKit, FFmpegKitConfig, ReturnCode, etc.) is 100% identical —
  # no Swift/ObjC++ code changes are needed.
  #
  # Includes audio codecs: MP3, AAC, FLAC, OPUS, WAV, ALAC, OGG/Vorbis,
  # AMR-NB, AMR-WB, AC3, DTS, SPEEX, and more. No video codecs.
  #
  # Latest: 6.0.2 (June 15, 2025)
  # Source: https://github.com/maitrungduc1410/ffmpegkit-ios
  s.dependency "ffmpeg-mobile-min", "~> 6.0"
  
  # MP3 Encoding Support (LAME 3.100 C Library)
  s.dependency "lame", "~> 1.2.2"

  s.pod_target_xcconfig = {
    # Required for Swift to be callable from ObjC++ (generates the -Swift.h header)
    "DEFINES_MODULE"                 => "YES",

    # Enable New Architecture / JSI path
    "OTHER_SWIFT_FLAGS"              => "$(inherited) -D RCT_NEW_ARCH_ENABLED",

    # Swift 5.9 (Xcode 15+) — required for React Native 0.76+
    "SWIFT_VERSION"                  => "5.9",

    # No SWIFT_OBJC_BRIDGING_HEADER — bridging headers are unsupported in
    # framework targets (which is how CocoaPods builds pods). AudioFFmpegImpl.swift
    # only imports FFmpegKit directly as a Swift module; it needs no ObjC bridging.
  }

  # New Architecture only — wired by the host app's react_native_pods.rb
  install_modules_dependencies(s)
end
