/**
 * ConvertScreen — Convert any audio file to another format.
 *
 * Demonstrates: AudioFFmpeg.convert() with custom codec options.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import RNFS from 'react-native-fs';
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';
import { FilePicker }   from '../components/FilePicker';
import { ActionButton } from '../components/ActionButton';
import { LogView }      from '../components/LogView';
import { ProgressBar }  from '../components/ProgressBar';
import { C }            from '../components/theme';

const FORMATS = [
  { label: 'MP3',  ext: 'mp3',  opts: '-c:a libmp3lame -q:a 2' },
  { label: 'AAC',  ext: 'm4a',  opts: '-c:a aac -b:a 192k' },
  { label: 'OGG',  ext: 'ogg',  opts: '-c:a libvorbis -q:a 5' },
  { label: 'OPUS', ext: 'opus', opts: '-c:a libopus -b:a 128k -vbr on' },
  { label: 'FLAC', ext: 'flac', opts: '-c:a flac -compression_level 8' },
  { label: 'WAV',  ext: 'wav',  opts: '-c:a pcm_s16le' },
];

export function ConvertScreen() {
  const [inputPath,  setInputPath]  = useState('');
  const [format,     setFormat]     = useState(FORMATS[0]!);
  const [loading,    setLoading]    = useState(false);
  const [speed,      setSpeed]      = useState<number | undefined>();
  const [log,        setLog]        = useState<string[]>([]);
  const [sessionId,  setSessionId]  = useState('');


  const print = (msg: string) => setLog(p => [...p, msg]);

  const run = async () => {
    if (!inputPath) { print('❌ Pick an input file first'); return; }
    const out = `${RNFS.CachesDirectoryPath}/converted_${Date.now()}.${format.ext}`;
    setLoading(true);
    setSpeed(undefined);
    print(`▶ Converting → .${format.ext}  (${format.opts || 'copy'})`);

    try {
      const id = await AudioFFmpeg.runAsync(
        `-i "${inputPath}" -vn ${format.opts} -y "${out}"`,
        {
          onProgress: p => setSpeed(p.speed),
          onComplete: e => {
            setLoading(false);
            setSpeed(undefined);
            if (e.returnCode === 0) {
              print(`✅ Done!  Output: ${out.split('/').pop()}`);
            } else {
              print(`❌ FFmpeg exited ${e.returnCode}`);
              print(e.output.slice(-300));
            }
          },
          onLog: l => {
            if (l.line.startsWith('frame=') || l.line.startsWith('size=')) print(`  ${l.line}`);
          },
        }
      );
      setSessionId(id);
    } catch (e: any) {
      console.error('[ConvertScreen] error:', e);
      print(`❌ ${e?.message ?? String(e)}`);
      print(`   stack: ${e?.stack ?? 'n/a'}`);
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (sessionId) {
      await AudioFFmpeg.cancel(sessionId);
      setLoading(false);
      print('⏹ Cancelled');
    }
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.heading}>Convert Audio Format</Text>

        <FilePicker
          label="INPUT FILE"
          path={inputPath}
          onPick={(p) => setInputPath(p.path)}
        />

        <Text style={s.sectionLabel}>OUTPUT FORMAT</Text>
        <View style={s.chips}>
          {FORMATS.map(f => (
            <TouchableOpacity
              key={f.ext}
              style={[s.chip, format.ext === f.ext && s.chipActive]}
              onPress={() => setFormat(f)}
            >
              <Text style={[s.chipText, format.ext === f.ext && s.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ProgressBar visible={loading} speed={speed} label={`Converting to ${format.label}…`} />

        {loading
          ? <ActionButton label="Cancel" onPress={cancel} color={C.error} />
          : <ActionButton label={`Convert to ${format.label}`} onPress={run} loading={loading} disabled={!inputPath} />}
      </ScrollView>

      <LogView lines={log} onClear={() => setLog([])} />
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  scroll:        { padding: 16, paddingBottom: 0 },
  heading:       { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 16 },
  sectionLabel:  { color: C.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chipActive:    { backgroundColor: C.accentDim, borderColor: C.accent },
  chipText:      { color: C.muted, fontWeight: '600', fontSize: 13 },
  chipTextActive:{ color: C.white },
});
