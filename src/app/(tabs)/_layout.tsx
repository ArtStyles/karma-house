import { Tabs } from 'expo-router';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationMaterial } from '../../components/NavigationMaterial';
import { Icon, type IconName } from '../../components/ui';
import { colors } from '../../theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const inset = Math.max(16, (width - 520) / 2);
  const tabIcon = (name: IconName, active: IconName) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => <Icon name={focused ? active : name} color={color} size={24} />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarActiveBackgroundColor: '#E5EFFACC',
      tabBarHideOnKeyboard: true,
      tabBarBackground: () => <NavigationMaterial />,
      tabBarStyle: {
        position: 'absolute', left: inset, right: inset, bottom: Math.max(insets.bottom, 14),
        height: 68, padding: 5, paddingBottom: 5, borderRadius: 34, borderTopWidth: 0,
        borderWidth: 1, borderColor: '#FFFFFFCC', backgroundColor: 'transparent', overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.10)',
      },
      tabBarItemStyle: { borderRadius: 28, overflow: 'hidden', marginHorizontal: 2 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      tabBarLabelPosition: 'below-icon',
      sceneStyle: { backgroundColor: colors.paper },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('compass-outline', 'compass') }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favoritos', tabBarIcon: tabIcon('heart-outline', 'heart') }} />
      <Tabs.Screen name="publish" options={{ title: 'Publicar', tabBarIcon: tabIcon('add-circle-outline', 'add-circle') }} />
      <Tabs.Screen name="profile" options={{ title: 'Mi espacio', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
