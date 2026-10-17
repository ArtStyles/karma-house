// Values come from DESIGN.md: `colorsDay` here, `colors` (night) below. Tints are the token plus
// alpha (#RRGGBBAA) so a state chip reads the same over ground, surface or a sheet.
export const lightColors = {
  ink: '#1A2B3B', body: '#4D5A66', muted: '#66717D', primary: '#0153A8', primaryFill: '#0153A8',
  // By day a sheet is cal, so the white cards inside it still read as cards.
  softBlue: '#0153A81F', paper: '#FAF6EE', sheet: '#FAF6EE', surface: '#FFFFFF', raised: '#F2EADC', border: '#E6DCCB',
  green: '#3F6B4F', greenFill: '#3F6B4F', softGreen: '#3F6B4F1F',
  danger: '#C32935', dangerFill: '#C32935', softDanger: '#C329351A',
  // Sol is decoration only by day; as text, `amber` is ocre.
  amber: '#8A5C15', softAmber: '#E3B04B29', sol: '#E3B04B', onSol: '#0A1626', ocre: '#8A5C15', softOcre: '#8A5C151F',
  rose: '#C32935', softRose: '#C329351A',
  inkBlue: '#1A2B3B', mutedBlue: '#66717D', softNeutral: '#F2EADC', skeleton: '#F2EADC',
  accentBorder: '#A9C8EC', blueDecoration: '#DCE9F9', blueLine: '#BCD2EF',
  onPrimary: '#FFFFFF', onPrimaryMuted: '#E0EEFF', inverseSurface: '#1A2B3B', inverseInk: '#FAF6EE', inversePrimary: '#8CC0F7',
  // The border of a secondary button: stronger than a card's line.
  outline: '#C9BBA3',
  // Text and icons on danger-fill, on the photo scrim and on the navy banner, in both modes.
  onDark: '#FFFFFF',
  banner: '#173B60', bannerIcon: '#305577', bannerText: '#CADBEB',
  // By day the paper is arena, so a sign or paper card still shows on white cards and on the cal ground.
  // Cream is light in both modes, so its blue is the day blue in both.
  cream: '#F2EADC', creamInk: '#1A2B3B', creamBlue: '#0153A8', glow: '#E3B04B29', photoGround: '#F2EADC',
  overlay: '#050D189E', subtleOverlay: '#142E461A', photoOverlay: '#0A16269E',
  navigation: '#FAF6EE', navigationGlass: '#FAF6EED9', navigationBorder: '#E6DCCB', navigationActive: '#0153A814',
  switchTrack: '#D8CDB9', switchThumb: '#FFFFFF',
};

export type ThemeColors = typeof lightColors;

export const darkColors: ThemeColors = {
  ink: '#F3EFE7', body: '#C3CDD6', muted: '#8FA2B5', primary: '#8CC0F7', primaryFill: '#8CC0F7',
  softBlue: '#8CC0F724', paper: '#0A1626', sheet: '#0F1E31', surface: '#13233A', raised: '#1B3654', border: '#D7E2EC1F',
  green: '#8CC7A1', greenFill: '#8CC7A1', softGreen: '#8CC7A129',
  danger: '#FF929D', dangerFill: '#B32839', softDanger: '#FF929D24',
  amber: '#E3B04B', softAmber: '#E3B04B29', sol: '#E3B04B', onSol: '#0A1626', ocre: '#E7BF72', softOcre: '#E7BF7224',
  rose: '#FF929D', softRose: '#FF929D24',
  inkBlue: '#F3EFE7', mutedBlue: '#8FA2B5', softNeutral: '#1B3654', skeleton: '#1B3654',
  accentBorder: '#8CC0F773', blueDecoration: '#1B3654', blueLine: '#8CC0F759',
  onPrimary: '#0B1A29', onPrimaryMuted: '#0B1A29B8', inverseSurface: '#F3EFE7', inverseInk: '#0A1626', inversePrimary: '#0153A8',
  outline: '#D7E2EC47',
  onDark: '#FFFFFF',
  banner: '#173B60', bannerIcon: '#305577', bannerText: '#CADBEB',
  cream: '#FAF6EE', creamInk: '#1A2B3B', creamBlue: '#0153A8', glow: '#E3B04B33', photoGround: '#050D18',
  overlay: '#050D189E', subtleOverlay: '#050D1866', photoOverlay: '#0A16269E',
  navigation: '#0A1626', navigationGlass: '#0A1626D9', navigationBorder: '#D7E2EC1A', navigationActive: '#8CC0F71F',
  switchTrack: '#D7E2EC38', switchThumb: '#F3EFE7',
};
