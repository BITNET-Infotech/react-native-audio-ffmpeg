import React, { useRef, useEffect } from 'react';
import { ScrollView, Text, StyleSheet, View, TouchableOpacity } from 'react-native';
import { C } from './theme';

interface Props {
  lines: string[];
  onClear: () => void;
}

export function LogView({ lines, onClear }: Props) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    ref.current?.scrollToEnd({ animated: true });
  }, [lines]);

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.label}>Console</Text>
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.clear}>Clear</Text>
        </TouchableOpacity>
      </View>
      <ScrollView ref={ref} style={s.scroll} contentContainerStyle={s.content}>
        {lines.length === 0
          ? <Text style={s.placeholder}>Tap a button to run…</Text>
          : lines.map((l, i) => (
              <Text key={i} style={[s.line, lineColor(l)]}>{l}</Text>
            ))}
      </ScrollView>
    </View>
  );
}

function lineColor(line: string) {
  if (line.startsWith('✅')) return { color: C.success };
  if (line.startsWith('❌')) return { color: C.error };
  if (line.startsWith('⚡') || line.startsWith('  ')) return { color: C.warn };
  return {};
}

const s = StyleSheet.create({
  wrap:        { flex: 1, margin: 16, marginTop: 8, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderColor: C.border },
  label:       { color: C.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  clear:       { color: C.accent, fontSize: 12 },
  scroll:      { flex: 1 },
  content:     { padding: 10, paddingBottom: 16 },
  line:        { color: C.text, fontFamily: 'Courier', fontSize: 11, lineHeight: 18 },
  placeholder: { color: C.muted, fontFamily: 'Courier', fontSize: 11 },
});
