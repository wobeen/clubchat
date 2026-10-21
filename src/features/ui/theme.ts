// ─── 디자인 토큰 ──────────────────────────────────────────────────────────────
// 앱 전역 디자인 토큰. 2026-09 리브랜딩:
//  - 브랜드/강조 색: 하늘색→시안→민트→올리브그린 그라데이션(BAE2FE/95E4F3/42F2F2/24F8AE/63AB3F)
//  - 중성/배경 색: 회색→민트→세이지→카키 그라데이션(F8F7FA/F4F5F6/EBF0F0/E9EFE8/EDEDDB)
// 둘 다 coolors.co 조합을 그대로 가져왔다.
//
// 브랜드 5색은 채도가 높고 밝아서 흰 배경 위 버튼/링크 텍스트로 쓰면 대비가
// 부족하다(예: 63AB3F + 흰 글자 ≈ 2.9:1). 그래서:
//  - primary/success 등 "상호작용 가능한" 토큰은 같은 색상군에서 명도를 낮춰
//    파생시킨 색(대비 확보)을 쓴다.
//  - accent* 5개는 원본 색 그대로 유지하고, 배지·강조 배경·그라데이션처럼
//    글자를 얹지 않거나 진한 텍스트를 얹는 곳에 쓴다.
// 중성 5색은 전부 명도가 매우 높아(≈93~98%) 그 자체로 배경 레이어링에만 쓰고,
// 텍스트/보더 색으로는 쓰지 않는다.
//
// colors에는 두 계층의 키가 섞여 있다:
//  - "정식" 다섯 개 키(primary/background/surface/text/textSecondary/border/danger/success):
//    앞으로 새로 작성하는 화면은 이 이름을 쓴다.
//  - 그 외 키(primaryDark/surfaceSecondary/textPrimary/error/destructive 등):
//    src/features/schedule/scheduleUtils.ts가 기존에 쓰던 키 이름을 그대로 재노출하기
//    위해 존재한다(호출부 무변경 요구사항). 값은 위 정식 키와 동일한 실제 팔레트를 가리킨다.

export const colors = {
  // ── 정식 다섯 개 키 ──────────────────────────────────────────────────────
  primary: '#417029',
  background: '#F8F7FA',
  surface: '#FFFFFF',
  text: '#191F28',
  textSecondary: '#5C7A6E',
  border: '#E9EFE8',
  danger: '#E5484D',
  success: '#0FA876',

  // ── scheduleUtils 호환용 별칭/추가 키 (동일한 실제 팔레트 값) ──────────────
  primaryDark: '#2F5A1E',
  surfaceSecondary: '#F4F5F6',
  textPrimary: '#191F28',
  error: '#E5484D',
  destructive: '#E5484D',

  // ── 얇은 구분선(카드 내부 등에 쓰이는 더 옅은 보더) ────────────────────────
  borderLight: '#EBF0F0',

  // ── 중성 팔레트 5번째 톤(카키, 선택/활성 상태 강조 배경용) ─────────────────
  highlightBackground: '#EDEDDB',

  // ── 브랜드 팔레트 원색 5개(강조·배지·그라데이션용, 변형 없이 그대로) ───────
  accentSky: '#BAE2FE',
  accentCyan: '#95E4F3',
  accentTurquoise: '#42F2F2',
  accentMint: '#24F8AE',
  accentOlive: '#63AB3F',
} as const

// ── 동아리/스터디 아이콘 팔레트 (2026-09, 라벤더→페리윙클→시안→민트→옐로우) ────
// 클럽마다 색이 다르게 뒤섞여 보인다는 피드백으로, 더 이상 id를 해시해서 색을
// 고르지 않는다. 동아리는 항상 clubDefaultIconColor, 스터디(방)는 항상
// roomDefaultIconColor 하나로 통일한다 — iconPalette에서 서로 다른 두 톤을
// 고정 배정한 것. 나머지 3색은 지금 당장 코드에서 쓰이진 않지만(추후 사용자가
// 동아리/방에 이미지를 직접 업로드하는 기능이 들어오기 전까지의 기본값 팔레트),
// 팔레트 전체를 한곳에 남겨 확장 여지를 둔다.
export const iconPalette = [
  { bg: '#F1EDFB', text: '#7C5CC9' }, // 라벤더
  { bg: '#E9EEFE', text: '#4C6FD1' }, // 페리윙클
  { bg: '#D8FFFB', text: '#0E9488' }, // 시안
  { bg: '#D8FCDD', text: '#229150' }, // 민트
  { bg: '#FCFBC3', text: '#96800F' }, // 옐로우
] as const

export const clubDefaultIconColor = iconPalette[1] // 페리윙클
export const roomDefaultIconColor = iconPalette[3] // 민트

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
