import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider } from '../data/AppDataProvider';
import { colors } from '../theme/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppDataProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.onPrimary,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
          <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
          <Stack.Screen name="match/new" options={{ title: 'New match' }} />
          <Stack.Screen name="match/[id]/score" options={{ title: 'Scoring' }} />
          <Stack.Screen name="match/[id]/index" options={{ title: 'Scorecard' }} />
          <Stack.Screen name="backup" options={{ title: 'Backup and restore' }} />
        </Stack>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}
