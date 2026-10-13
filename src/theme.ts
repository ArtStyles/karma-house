import { Platform } from 'react-native';

export { ThemeProvider, useTheme, createThemedStyles } from './theme/ThemeProvider';
export type { ThemeColors } from './theme/palette';
export const typefaces = { display: Platform.select({ ios: 'System', android: 'sans-serif', default: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }) };
// From `wideMinWidth` (a computer, or a tablet held sideways) navigation moves to a side rail.
export const layout = { tabContentBottom: 24, wideMinWidth: 1024 };
export const accountLayout = { maxWidth: 620, gutter: 22, radius: 26, gap: 16, actionWidth: 330 };
export const internalLayout = { maxWidth: 720, gutter: 20, radius: 16, gap: 16, actionGap: 12 };
export const formatMoney = (value: number) => `$ ${new Intl.NumberFormat('es-CU', { maximumFractionDigits: 0 }).format(value)}`;
