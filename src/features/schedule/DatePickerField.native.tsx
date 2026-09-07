import React, { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { Pressable } from '../ui/Pressable'
import DateTimePicker from '@react-native-community/datetimepicker'
import { colors, formatDateDisplay, radius, spacing } from './scheduleUtils'

export interface DatePickerFieldProps {
  value: Date | null
  onChange: (date: Date) => void
  placeholder: string
  hasError?: boolean
}

export function DatePickerField({ value, onChange, placeholder, hasError }: DatePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false)
  const displayText = value ? formatDateDisplay(value) : placeholder

  // ── Android: 네이티브 캘린더 다이얼로그 ──────────────────────────────
  if (Platform.OS === 'android') {
    return (
      <>
        <Pressable
          style={({ pressed }) => [
            styles.dateButton,
            hasError && styles.inputError,
            pressed && styles.dateButtonPressed,
          ]}
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={displayText}
        >
          <Text style={[styles.dateButtonText, !value && styles.placeholderText]}>
            {displayText}
          </Text>
          <Text style={styles.calendarIcon}>📅</Text>
        </Pressable>
        {showPicker && (
          <DateTimePicker
            value={value ?? new Date()}
            mode="date"
            display="calendar"
            onChange={(event, selectedDate) => {
              setShowPicker(false)
              if (event.type === 'set' && selectedDate) onChange(selectedDate)
            }}
          />
        )}
      </>
    )
  }

  // ── iOS: 버튼 아래 인라인 달력 (Modal 없음, 선택 즉시 닫힘) ──────────
  return (
    <View>
      <Pressable
        style={({ pressed }) => [
          styles.dateButton,
          hasError && styles.inputError,
          pressed && styles.dateButtonPressed,
          showPicker && styles.dateButtonActive,
        ]}
        onPress={() => setShowPicker((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={displayText}
      >
        <Text style={[styles.dateButtonText, !value && styles.placeholderText]}>
          {displayText}
        </Text>
        <Text style={styles.calendarIcon}>{showPicker ? '▲' : '📅'}</Text>
      </Pressable>

      {showPicker && (
        <View style={styles.inlinePickerWrap}>
          <DateTimePicker
            value={value ?? new Date()}
            mode="date"
            display="inline"
            onChange={(_, selectedDate) => {
              if (selectedDate) {
                onChange(selectedDate)
                setShowPicker(false)
              }
            }}
            style={styles.inlinePicker}
          />
        </View>
      )}
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
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  dateButtonPressed: { opacity: 0.7 },
  dateButtonActive: { borderColor: colors.primary },
  inputError: { borderColor: colors.error },
  dateButtonText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  placeholderText: { color: colors.textSecondary },
  calendarIcon: { fontSize: 16, marginLeft: spacing.sm },

  inlinePickerWrap: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inlinePicker: {
    backgroundColor: colors.surface,
  },
})
