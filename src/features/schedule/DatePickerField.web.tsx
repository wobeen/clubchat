import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, formatDateDisplay, radius, spacing } from './scheduleUtils'

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

export function DatePickerField({ value, onChange, placeholder, hasError }: DatePickerFieldProps) {
  const displayText = value ? formatDateDisplay(value) : placeholder
  const dateStr = value ? toDateInputStr(value) : ''

  return (
    <View
      style={[
        styles.dateButton,
        hasError && styles.inputError,
        { position: 'relative', overflow: 'hidden' } as object,
      ]}
    >
      <Text style={[styles.dateButtonText, !value && styles.placeholderText]}>
        {displayText}
      </Text>
      <Text style={styles.calendarIcon}>📅</Text>
      {(React.createElement as any)('input', {
        type: 'date',
        value: dateStr,
        onChange: (e: any) => {
          const v: string = e.target.value
          if (v) {
            const [y, mo, d] = v.split('-').map(Number)
            onChange(new Date(y, mo - 1, d))
          }
        },
        style: {
          position: 'absolute',
          inset: 0,
          opacity: 0,
          cursor: 'pointer',
          width: '100%',
          height: '100%',
        },
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  inputError: { borderColor: colors.error },
  dateButtonText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  placeholderText: { color: colors.textSecondary },
  calendarIcon: { fontSize: 16, marginLeft: spacing.sm },
})
