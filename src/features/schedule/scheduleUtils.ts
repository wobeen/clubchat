import type { ResponseStatus } from './types'

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

// ─── 디자인 토큰 ──────────────────────────────────────────────────────────────

export const colors = {
  primary: '#6366f1',       // indigo-500
  primaryDark: '#4f46e5',   // indigo-600
  surface: '#ffffff',
  surfaceSecondary: '#f8fafc',
  border: '#e2e8f0',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  error: '#ef4444',
  destructive: '#dc2626',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const
