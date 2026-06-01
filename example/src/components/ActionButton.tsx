import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { C, S } from './theme';

interface Props {
  label:    string;
  onPress:  () => void;
  loading?: boolean;
  disabled?: boolean;
  color?:   string;
}

export function ActionButton({ label, onPress, loading, disabled, color }: Props) {
  const bg = color ?? C.accent;
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: bg }, (disabled || loading) && s.dim]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={C.white} size="small" />
        : <Text style={s.label}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn:   { borderRadius: S.radius, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  dim:   { opacity: 0.5 },
  label: { color: C.white, fontWeight: '700', fontSize: 15 },
});
