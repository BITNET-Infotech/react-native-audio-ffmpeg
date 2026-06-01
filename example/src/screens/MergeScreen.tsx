/**
 * MergeScreen — Concatenate multiple audio files into one.
 *
 * Demonstrates: AudioFFmpeg.merge()
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import RNFS from 'react-native-fs';
import AudioFFmpeg from '@bitnet-infotech/react-native-audio-ffmpeg';
import { FilePicker }   from '../components/FilePicker';
import { ActionButton } from '../components/ActionButton';
import { LogView }      from '../components/LogView';
import { ProgressBar }  from '../components/ProgressBar';
import { C, S }         from '../components/theme';

const OUT_FORMATS = ['m4a', 'flac', 'wav', 'ogg', 'opus'];

export function MergeScreen() {
  const [files,     setFiles]     = useState<{ path: string; name: string }[]>([]);
  const [outFormat, setOutFormat] = useState('m4a');
  const [loading,   setLoading]   = useState(false);
  const [log,       setLog]       = useState<string[]>([]);


  const print = (msg: string) => setLog(p => [...p, msg]);

  const addFiles = (picked: { path: string; name: string }[]) => {
    setFiles(prev => [...prev, ...picked]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const run = async () => {
    if (files.length < 2) { print('❌ Add at least 2 files'); return; }
    const out = `${RNFS.CachesDirectoryPath}/merged_${Date.now()}.${outFormat}`;
    setLoading(true);
    print(`▶ Merging ${files.length} files → ${out.split('/').pop()}`);
    files.forEach((f, i) => print(`  [${i + 1}] ${f.name}`));

    try {
      const result = await AudioFFmpeg.merge(files.map(f => f.path), out);
      if (result.returnCode === 0) {
        print(`✅ Merged!  (${result.duration}ms)  →  ${out.split('/').pop()}`);
      } else {
        print(`❌ FFmpeg exited ${result.returnCode}`);
        print(result.output.slice(-300));
      }
    } catch (e: any) {
      console.error('[MergeScreen] error:', e);
      print(`❌ ${e?.message ?? String(e)}`);
      print(`   stack: ${e?.stack ?? 'n/a'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.heading}>Merge Audio Files</Text>
        <Text style={s.sub}>Files are joined in the order listed below.</Text>

        {/* Multi-file picker */}
        <FilePicker
          label="ADD FILES (tap to pick multiple)"
          onPick={(p) => addFiles([p])}
          onPickMulti={addFiles}
          multiple
        />

        {/* File list */}
        {files.length > 0 && (
          <View style={s.fileList}>
            {files.map((f, i) => (
              <View key={i} style={s.fileRow}>
                <Text style={s.fileIdx}>{i + 1}</Text>
                <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
                <TouchableOpacity onPress={() => removeFile(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.remove}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Output format chips */}
        <Text style={s.sectionLabel}>OUTPUT FORMAT</Text>
        <View style={s.chips}>
          {OUT_FORMATS.map(f => (
            <TouchableOpacity
              key={f}
              style={[s.chip, outFormat === f && s.chipActive]}
              onPress={() => setOutFormat(f)}
            >
              <Text style={[s.chipText, outFormat === f && s.chipTextActive]}>
                {f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ProgressBar visible={loading} label="Merging…" />

        <ActionButton
          label={`Merge ${files.length} file${files.length !== 1 ? 's' : ''} → .${outFormat}`}
          onPress={run}
          loading={loading}
          disabled={files.length < 2}
        />
      </ScrollView>

      <LogView lines={log} onClear={() => setLog([])} />
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  scroll:        { padding: 16, paddingBottom: 0 },
  heading:       { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  sub:           { color: C.muted, fontSize: 13, marginBottom: 16 },
  sectionLabel:  { color: C.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  fileList:      { backgroundColor: C.surface, borderRadius: S.radius, borderWidth: 1, borderColor: C.border, marginBottom: 14, overflow: 'hidden' },
  fileRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border, gap: 10 },
  fileIdx:       { color: C.muted, fontWeight: '700', fontSize: 12, width: 18 },
  fileName:      { flex: 1, color: C.text, fontSize: 13 },
  remove:        { color: C.error, fontSize: 14, fontWeight: '700' },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chipActive:    { backgroundColor: C.accentDim, borderColor: C.accent },
  chipText:      { color: C.muted, fontWeight: '600', fontSize: 13 },
  chipTextActive:{ color: C.white },
});
