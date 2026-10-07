import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, EmptyState } from '../components/ui';
import { useTheme } from '../theme';
export default function NotFound() {
  const { colors } = useTheme(); return <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><EmptyState title="Este lugar todavía no existe" description="Vuelve a explorar y encuentra tu próximo hogar." action={<Button label="Ir a Explorar" onPress={() => router.replace('/')} />} /></View>; }
