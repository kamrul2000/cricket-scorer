import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider } from '../data/AppDataProvider';
import { IntroHost } from '../intro/IntroHost';
import { colors } from '../theme/theme';

// Keep the native splash (logo on dark green) until the first screen has been laid out, so the
// hand-over to the intro has no blank frame. Called in module scope as Expo advises.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  SplashScreen.hide();
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1 }} onLayout={hideSplash}>
        <IntroHost>
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
              <Stack.Screen name="schedule/[id]/index" options={{ title: 'Upcoming match' }} />
              <Stack.Screen name="schedule/[id]/poster" options={{ title: 'Match poster' }} />
              <Stack.Screen name="match/[id]/export" options={{ title: 'Share scorecard' }} />
            </Stack>
          </AppDataProvider>
        </IntroHost>
      </View>
    </SafeAreaProvider>
  );
}
