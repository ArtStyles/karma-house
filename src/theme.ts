import { Platform, type TextStyle } from 'react-native';

export { ThemeProvider, useTheme, createThemedStyles } from './theme/ThemeProvider';
export type { ThemeColors } from './theme/palette';
// Calistoga ships one weight (400): never set another, or the platform fakes a bold.
export const typefaces = { display: Platform.select({ web: 'Calistoga, Georgia, serif', default: 'Calistoga' }) };
// From `wideMinWidth` (a computer, or a tablet held sideways) navigation moves to a side rail.
export const layout = { tabContentBottom: 24, wideMinWidth: 1024, railWidth: 248 };
export const internalLayout = { maxWidth: 720, gutter: 20, radius: 16, gap: 16, actionGap: 12 };

// DESIGN.md scale. Calistoga for titles and figures (never under 16 px), the system font for the rest.
const display = (fontSize: number, lineHeight: number, letterSpacing?: number): TextStyle => ({ fontFamily: typefaces.display, fontWeight: '400', fontSize, lineHeight, letterSpacing });
const tabular: TextStyle['fontVariant'] = ['tabular-nums'];
export const typography = {
  display: display(32, 38, -.4), displayLong: display(28, 32), listingTitle: display(30, 32, -.4),
  sheetTitle: display(24, 28), section: display(20, 24), cardTitle: display(18, 22),
  numeralLg: { ...display(32, 34), fontVariant: tabular }, numeral: { ...display(22, 26), fontVariant: tabular },
  body: { fontSize: 16, lineHeight: 22 }, bodySm: { fontSize: 15, lineHeight: 21 },
  control: { fontSize: 15, lineHeight: 20, fontWeight: '600' }, label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 }, price: { fontSize: 17, lineHeight: 22, fontWeight: '700', fontVariant: tabular },
} satisfies Record<string, TextStyle>;
// `sign` is the cartel only; photos in lists use an arch (see ArchImage).
export const rounded = { sign: 4, thumb: 16, inner: 22, card: 24, cardLg: 28, sheet: 32, pill: 999 };
export const spacing = { page: 16, safeTop: 52, gapXs: 6, gapSm: 8, gap: 10, gapMd: 12, gapLg: 14, section: 24, touch: 44 };
export const formatMoney = (value: number) => `$ ${new Intl.NumberFormat('es-CU', { maximumFractionDigits: 0 }).format(value)}`;
