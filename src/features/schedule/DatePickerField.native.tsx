import React, { useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
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
          accessibilityLabel={value ? displayText : placeholder}
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
            display="default"
            onChange={(event, selectedDate) => {
              setShowPicker(false)
              if (event.type === 'set' && selectedDate) onChange(selectedDate)
            }}
          />
        )}
      </>
    )
  }

  // ── iOS: 하단 시트 모달 ────────────────────────────────────────────────
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
        accessibilityLabel={value ? displayText : placeholder}
      >
        <Text style={[styles.dateButtonText, !value && styles.placeholderText]}>
          {displayText}
        </Text>
        <Text style={styles.calendarIcon}>📅</Text>
      </Pressable>

      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Pressable onPress={() => setShowPicker(false)} accessibilityRole="button">
                <Text style={styles.pickerCancel}>취소</Text>
              </Pressable>
              <Text style={styles.pickerTitle}>날짜 선택</Text>
              <Pressable onPress={() => setShowPicker(false)} accessibilityRole="button">
                <Text style={styles.pickerDone}>완료</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={value ?? new Date()}
              mode="date"
              display="spinner"
              onChange={(_, selectedDate) => {
                if (selectedDate) onChange(selectedDate)
              }}
            />
          </View>
        </View>
      </Modal>
    </>
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
  inputError: { borderColor: colors.error },
  dateButtonText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  placeholderText: { color: colors.textSecondary },
  calendarIcon: { fontSize: 16, marginLeft: spacing.sm },

  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xl,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  pickerCancel: { fontSize: 15, color: colors.textSecondary },
  pickerDone: { fontSize: 15, fontWeight: '600', color: colors.primary },
})
