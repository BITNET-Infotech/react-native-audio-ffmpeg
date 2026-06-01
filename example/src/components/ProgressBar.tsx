import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from './theme';

interface Props {
  visible:  boolean;
  speed?:   number;
  label?:   string;
}

export function ProgressBar({ visible, speed, label }: Props) {
  if (!visible) return null;
  return (
    <View style={s.wrap}>
      <View style={s.bar}>
        <View style={s.fill} />
      </View>
      <Text style={s.text}>
        {label ?? 'Processing…'}{speed != null ? `  ${speed.toFixed(2)}x realtime` : ''}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 8 },
  bar:  { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  fill: { height: 4, backgroundColor: C.accent, width: '100%', borderRadius: 2 },
  text: { color: C.muted, fontSize: 11 },
});
