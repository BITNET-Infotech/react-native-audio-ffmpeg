import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { pick, keepLocalCopy, isErrorWithCode, errorCodes, types } from '@react-native-documents/picker';
import { C, S } from './theme';

interface PickedFile {
  path: string;
  name: string;
}

interface Props {
  label:        string;
  path?:        string;
  onPick:       (file: PickedFile) => void;
  multiple?:    boolean;
  onPickMulti?: (files: PickedFile[]) => void;
}

/**
 * Picks audio file(s) using @react-native-documents/picker,
 * then calls keepLocalCopy() to copy them into the app's cache dir
 * so FFmpeg can access them with a plain file:// path.
 *
 * On iOS, file pickers use UTIs (Uniform Type Identifiers), NOT MIME types.
 * 'audio/*' (MIME) is silently ignored on iOS — which is why WAV and M4A
 * files don't appear. We must explicitly list the UTIs we want:
 *   - public.audio                  → generic audio (mp3, flac, opus…)
 *   - com.microsoft.waveform-audio  → .wav files
 *   - com.apple.m4a-audio           → .m4a files
 *   - public.mpeg-4-audio           → .aac / .m4a (MPEG-4 audio)
 * On Android, types.audio resolves to 'audio/*' which covers everything.
 */
// iOS-specific UTIs that expose WAV + M4A in the document picker
const AUDIO_TYPES = [
  types.audio,                     // 'public.audio' (iOS) | 'audio/*' (Android)
  'com.microsoft.waveform-audio',  // WAV
  'com.apple.m4a-audio',           // M4A
  'public.mpeg-4-audio',           // AAC / MPEG-4 audio
] as string[];

export function FilePicker({ label, path, onPick, multiple, onPickMulti }: Props) {
  const pickFiles = async () => {
    try {
      const results = await pick({
        type: AUDIO_TYPES,
        allowMultiSelection: multiple ?? false,
      });

      if (results.length === 0) return;

      const filesToCopy = results.map(r => ({
        uri:      r.uri,
        fileName: r.name ?? `audio_${Date.now()}`,
      }));

      // keepLocalCopy converts content:// URIs to real file paths FFmpeg can use
      const copies = await keepLocalCopy({
        files: [filesToCopy[0], ...filesToCopy.slice(1)],
        destination: 'cachesDirectory',
      });

      const picked: PickedFile[] = copies
        .filter(c => c.status === 'success')
        .map((c, i) => ({
          // strip file:// prefix so FFmpeg gets a plain path
          path: decodeURIComponent((c as any).localUri.replace(/^file:\/\//, '')),
          name: results[i]?.name ?? 'audio',
        }));

      if (picked.length === 0) return;

      if (multiple && onPickMulti) {
        onPickMulti(picked);
      } else {
        onPick(picked[0]!);
      }

    } catch (e: any) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return; // user cancelled
      console.error('[FilePicker] error:', e);
      console.error('[FilePicker] stack:', e?.stack);
      throw e;
    }
  };

  return (
    <TouchableOpacity style={s.btn} onPress={pickFiles} activeOpacity={0.7}>
      <View style={s.row}>
        <Text style={s.icon}>📂</Text>
        <View style={s.textWrap}>
          <Text style={s.label}>{label}</Text>
          {path
            ? <Text style={s.path} numberOfLines={1}>{path.split('/').pop()}</Text>
            : <Text style={s.placeholder}>Tap to select{multiple ? ' (multiple)' : ''}…</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn:         { backgroundColor: C.surface, borderRadius: S.radius, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon:        { fontSize: 20 },
  textWrap:    { flex: 1 },
  label:       { color: C.muted, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  path:        { color: C.text, fontSize: 13 },
  placeholder: { color: C.border, fontSize: 13, fontStyle: 'italic' },
});
