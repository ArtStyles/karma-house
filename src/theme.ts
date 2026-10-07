import { Platform } from 'react-native';

export { ThemeProvider, useTheme, createThemedStyles } from './theme/ThemeProvider';
export type { ThemeColors } from './theme/palette';
export const typefaces = { display: Platform.select({ ios: 'System', android: 'sans-serif', default: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }) };
export const layout = { tabContentBottom: 144 };
export const accountLayout = { maxWidth: 620, gutter: 22, radius: 26, gap: 16, actionWidth: 330 };
export const formatMoney = (value: number) => `$ ${new Intl.NumberFormat('es-CU', { maximumFractionDigits: 0 }).format(value)}`;
