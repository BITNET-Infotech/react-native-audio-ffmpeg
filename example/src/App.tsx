/**
 * react-native-audio-ffmpeg — Full Demo App
 *
 * Tab navigation:
 *   Convert  — AudioFFmpeg.convert() with format picker
 *   Merge    — AudioFFmpeg.merge() with multi-file list
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConvertScreen } from './screens/ConvertScreen';
import { MergeScreen }   from './screens/MergeScreen';
import { C }             from './components/theme';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerStyle:      { backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border, elevation: 0, shadowOpacity: 0 },
            headerTitleStyle: { color: C.text, fontWeight: '700', fontSize: 16 },
            tabBarStyle:      { backgroundColor: C.bg, borderTopColor: C.border, borderTopWidth: 1 },
            tabBarActiveTintColor:   C.accent,
            tabBarInactiveTintColor: C.muted,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            tabBarShowIcon: false,
          }}
        >
          <Tab.Screen
            name="Convert"
            component={ConvertScreen}
            options={{ title: '🔄  Convert' }}
          />
          <Tab.Screen
            name="Merge"
            component={MergeScreen}
            options={{ title: '🔗  Merge' }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
