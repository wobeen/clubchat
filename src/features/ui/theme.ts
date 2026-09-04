// ─── 디자인 토큰 ──────────────────────────────────────────────────────────────
// 앱 전역에서 실제로 쓰이고 있는 Toss 스타일 팔레트를 한곳에 모은 파일이다.
// 값은 app/(app)/index.tsx, app/(app)/clubs/[id].tsx, app/(app)/channels/[id]/chat.tsx
// 등 기존 화면의 StyleSheet에서 실제 쓰이던 값을 그대로 가져왔다(새로 발명한 값 없음).
//
// colors에는 두 계층의 키가 섞여 있다:
//  - "정식" 다섯 개 키(primary/background/surface/text/textSecondary/border/danger/success):
//    앞으로 새로 작성하는 화면은 이 이름을 쓴다.
//  - 그 외 키(primaryDark/surfaceSecondary/textPrimary/error/destructive 등):
//    src/features/schedule/scheduleUtils.ts가 기존에 쓰던 키 이름을 그대로 재노출하기
//    위해 존재한다(호출부 무변경 요구사항). 값은 위 정식 키와 동일한 실제 팔레트를 가리킨다.

export const colors = {
  // ── 정식 다섯 개 키 ──────────────────────────────────────────────────────
  primary: '#3B7DD8',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#191F28',
  textSecondary: '#8B95A1',
  border: '#E5E8EB',
  danger: '#E5484D',
  success: '#1FA65A',

  // ── scheduleUtils 호환용 별칭/추가 키 (동일한 실제 팔레트 값) ──────────────
  primaryDark: '#2E6BC0',
  surfaceSecondary: '#F2F4F6',
  textPrimary: '#191F28',
  error: '#E5484D',
  destructive: '#E5484D',

  // ── 얇은 구분선(카드 내부 등에 쓰이는 더 옅은 보더) ────────────────────────
  borderLight: '#EDEFF2',
} as const

// 아바타·동아리 배지 등에서 쓰이는 파스텔 팔레트
// (app/(app)/index.tsx의 CLUB_COLORS, src/features/chat/chatUtils.ts의 AVATAR_COLORS와 동일한 톤)
export const badgeColors = [
  { bg: '#E7EFFF', text: '#3B7DD8' },
  { bg: '#E8F7EE', text: '#1FA65A' },
  { bg: '#FDF0E7', text: '#E07A2E' },
  { bg: '#F0EAFB', text: '#7B5CD6' },
  { bg: '#E7F5FB', text: '#2493C6' },
  { bg: '#FBEFF3', text: '#D6588A' },
] as const

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
  lg: 20,
  full: 9999,
} as const

// 카드에서 공통으로 쓰이는 표준 그림자
export const shadows = {
  card: {
    shadowColor: 'rgba(25,31,40,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
} as const
