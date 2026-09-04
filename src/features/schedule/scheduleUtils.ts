import type { ResponseStatus } from './types'
import { colors, spacing, radius } from '../ui/theme'

// colors/spacing/radius는 src/features/ui/theme.ts의 값을 그대로 재노출한다.
// (이 파일이 예전에 직접 정의하던 값은 앱의 실제 팔레트와 다른 임의 색상이었다.
//  이 화면들을 건드리지 않고 값만 교체하기 위해 키 이름은 그대로 유지한다.)
export { colors, spacing, radius }

// ─── 날짜 포맷 ────────────────────────────────────────────────────────────────

/**
 * ISO 문자열을 "6월 23일 (월) 오후 3:00" 형태로 변환.
 * Intl.DateTimeFormat은 React Native(Hermes)와 Web 모두에서 동작한다.
 */
export function formatDateDisplay(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(d)
}

export function formatDatetime(iso: string): string {
  const date = new Date(iso)
  const datePart = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
  const timePart = new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
  return `${datePart} ${timePart}`
}

/**
 * 날짜만 — "2026년 6월 23일"
 */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(iso))
}

// ─── 응답 상태 표시 ───────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ResponseStatus, string> = {
  going: '참석',
  not_going: '불참',
  maybe: '미정',
}

export const STATUS_COLOR: Record<ResponseStatus, string> = {
  going: '#22c55e',   // green-500
  not_going: '#ef4444', // red-500
  maybe: '#f59e0b',  // amber-500
}

