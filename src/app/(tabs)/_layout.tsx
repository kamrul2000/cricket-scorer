import { Tabs } from 'expo-router';

import { colors, font } from '../../theme/theme';

// Text-only tab labels: large, readable, and no icon fonts to bundle.
const tab = (title: string) => ({
  title,
  tabBarIcon: () => null,
  tabBarIconStyle: { display: 'none' as const },
  tabBarLabelStyle: { fontSize: font.body, fontWeight: '700' as const },
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 8 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={tab('Matches')} />
      <Tabs.Screen name="teams" options={tab('Teams')} />
      <Tabs.Screen name="players" options={tab('Players')} />
      <Tabs.Screen name="settings" options={tab('Settings')} />
    </Tabs>
  );
}
