import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme, View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SystemUI from 'expo-system-ui';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { createAppearanceStore, resolveAppearance, type AppearancePreference, type ColorScheme } from '../settings/appearance';
import { darkColors, lightColors, type ThemeColors } from './palette';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
const preferenceStore = createAppearanceStore({ storage: AsyncStorage });
type Theme = {
  preference: AppearancePreference;
  scheme: ColorScheme;
  colors: ThemeColors;
  saveFailed: boolean;
  setPreference(preference: AppearancePreference): void;
};
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(preferenceStore.subscribe, preferenceStore.getState, preferenceStore.getState);
  const systemScheme = useColorScheme();
  const scheme = resolveAppearance(state.preference, systemScheme);
  const colors = scheme === 'dark' ? darkColors : lightColors;
  // Native builds embed Calistoga (expo-font plugin), so this resolves at once; the web fetches a 41 KB Latin subset.
  // A failed load falls back to the system font rather than holding the app.
  const [fontLoaded, fontError] = useFonts({ Calistoga: Platform.OS === 'web' ? require('../../assets/fonts/Calistoga.woff2') : require('../../assets/fonts/Calistoga.ttf') });
  const ready = state.ready && (fontLoaded || !!fontError);
  useEffect(() => { void preferenceStore.hydrate(); }, []);
  useLayoutEffect(() => {
    if (state.ready && Platform.OS !== 'web') Appearance.setColorScheme(state.preference === 'system' ? 'unspecified' : state.preference);
  }, [state.preference, state.ready]);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.paper).catch(() => undefined);
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.style.colorScheme = scheme;
  }, [colors, scheme]);
  useEffect(() => { if (ready) void SplashScreen.hideAsync().catch(() => undefined); }, [ready]);
  const theme = useMemo<Theme>(() => ({
    preference: state.preference, scheme, colors, saveFailed: state.saveFailed,
    setPreference: preference => { void preferenceStore.setPreference(preference); },
  }), [state.preference, state.saveFailed, scheme, colors]);
  return <ThemeContext.Provider value={theme}>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    {ready ? children : <View style={{ flex: 1, backgroundColor: colors.paper }} />}
  </ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider is required.');
  return theme;
}

/** Build each palette once; consumers subscribe without remounting their screen. */
export function createThemedStyles<T>(factory: (colors: ThemeColors) => T) {
  const themes = {
    light: { colors: lightColors, styles: factory(lightColors) },
    dark: { colors: darkColors, styles: factory(darkColors) },
  };
  return function useStyles() { return themes[useTheme().scheme]; };
}
