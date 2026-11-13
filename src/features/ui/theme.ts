// 라이트 리퀴드 글래스 토큰. 안료는 종이, 잉크, 블루 #0863BF 하나.
// #0A84FF는 같은 색상(약 210°)이지만 흰 글자가 3.65:1이라 채움·링크는 #0863BF를 쓴다.
// scheduleUtils가 기대하는 옛 키(primaryDark, error 등)는 같은 팔레트를 가리킨다.
// 빨강 위험색은 두지 않는다. error/destructive는 잉크다.

export const palette = {
  paper: '#FFFFFF',
  ink: '#1A1A1A',
  accent: '#0863BF',
} as const

export const colors = {
  paper: palette.paper,
  ink: palette.ink,
  accent: palette.accent,
  onAccent: palette.paper,
  link: palette.accent,
  mine: '#D7E6F5',
  markBg: '#EBEBEB',
  markText: palette.ink,
  glass: 'rgba(255,255,255,0.42)',
  glassText: 'rgba(255,255,255,0.70)',
  glassNested: 'rgba(255,255,255,0.38)',
  glassEdge: 'rgba(255,255,255,0.72)',
  wallpaper: '#F2F2F2',

  primary: palette.accent,
  background: '#F2F2F2',
  surface: palette.paper,
  text: palette.ink,
  textSecondary: '#5A5A5A',
  textMuted: '#5F5F5F',
  border: '#E8E8E8',
  danger: palette.ink,
  success: palette.accent,

  primaryDark: palette.accent,
  surfaceSecondary: '#F4F4F4',
  textPrimary: palette.ink,
  error: palette.ink,
  destructive: palette.ink,
  borderLight: '#E8E8E8',
  highlightBackground: palette.paper,

  accentSky: palette.paper,
  accentCyan: '#F4F4F4',
  accentTurquoise: '#EAEAEA',
  accentMint: '#D7E6F5',
  accentOlive: '#5A5A5A',
} as const

export const iconPalette = [
  { bg: '#EBEBEB', text: '#1A1A1A' },
  { bg: '#EBEBEB', text: '#1A1A1A' },
  { bg: '#E8E8E8', text: '#1A1A1A' },
  { bg: '#E8E8E8', text: '#1A1A1A' },
  { bg: '#F4F4F4', text: '#1A1A1A' },
] as const

export const clubDefaultIconColor = iconPalette[0]
export const roomDefaultIconColor = iconPalette[0]

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const

export const radius = {
  sm: 12,
  md: 16,
  lg: 26,
  panel: 28,
  sheet: 28,
  full: 9999,
} as const

export const type = {
  display: 28,
  title: 20,
  panel: 16,
  body: 14,
  control: 13,
  meta: 12,
} as const

export const glass = {
  chromeOpacity: 0.42,
  textOpacity: 0.7,
  nestedOpacity: 0.38,
  blur: 48,
  saturate: 1.85,
  chromeBlur: 36,
  chromeSaturate: 1.7,
} as const

export const shadows = {
  card: {
    shadowColor: 'rgba(26,26,26,1)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 4,
  },
  glass: {
    shadowColor: 'rgba(26,26,26,1)',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 6,
  },
} as const
