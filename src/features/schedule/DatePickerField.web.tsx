import React from 'react'
import { colors, radius, spacing } from './scheduleUtils'

export interface DatePickerFieldProps {
  value: Date | null
  onChange: (date: Date) => void
  placeholder: string
  hasError?: boolean
}

function toDateInputStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// RNW 이벤트 시스템 우회: View/Pressable 대신 native <input type="date"> 직접 렌더링.
// overlay 방식은 RNW가 포인터 이벤트를 가로채 date picker가 열리지 않으므로 사용 불가.
export function DatePickerField({ value, onChange, placeholder, hasError }: DatePickerFieldProps) {
  const dateStr = value ? toDateInputStr(value) : ''

  const style = {
    display: 'block',
    width: '100%',
    border: `1px solid ${hasError ? colors.error : colors.border}`,
    borderRadius: radius.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    fontSize: 15,
    color: colors.textPrimary,
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    minHeight: 44,
  }

  return (React.createElement as any)('input', {
    type: 'date',
    value: dateStr,
    onChange: (e: any) => {
      const v: string = e.target.value
      if (v) {
        const [y, mo, d] = v.split('-').map(Number)
        onChange(new Date(y, mo - 1, d))
      }
    },
    placeholder,
    style,
  })
}
