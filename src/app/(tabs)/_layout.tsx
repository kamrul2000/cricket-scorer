import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font } from '../../theme/theme';

// Text-only tab labels: large, readable, and no icon fonts to bundle.
const tab = (title: string) => ({
  title,
  tabBarIcon: () => null,
  tabBarIconStyle: { display: 'none' as const },
  tabBarLabelStyle: { fontSize: font.body, fontWeight: '700' as const },
});

export default function TabsLayout() {
  // The app draws edge to edge, so the phone's own navigation (3 buttons or a gesture bar)
  // sits over the bottom of the screen. Add its height below the 64 dp of tappable tabs,
  // otherwise the tabs end up partly underneath those buttons.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { height: 64 + insets.bottom, paddingBottom: 8 + insets.bottom, paddingTop: 8 },
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
