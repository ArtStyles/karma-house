import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../components/ui';
import { colors } from '../../theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 8);
  const tabIcon = (name: IconName, active: IconName) => ({ color, focused }: { color: ColorValue; focused: boolean }) => <Icon name={focused ? active : name} color={color} size={23} />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { height: 58 + paddingBottom, paddingTop: 7, paddingBottom, borderTopColor: colors.border, backgroundColor: colors.white }, tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 3 }, sceneStyle: { backgroundColor: colors.paper } }}>
    <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('compass-outline', 'compass') }} />
    <Tabs.Screen name="favorites" options={{ title: 'Favoritos', tabBarIcon: tabIcon('heart-outline', 'heart') }} />
    <Tabs.Screen name="publish" options={{ title: 'Publicar', tabBarIcon: tabIcon('add-circle-outline', 'add-circle') }} />
    <Tabs.Screen name="profile" options={{ title: 'Mi espacio', tabBarIcon: tabIcon('person-outline', 'person') }} />
  </Tabs>;
}
