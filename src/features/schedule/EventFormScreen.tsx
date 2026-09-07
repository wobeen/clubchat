import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Pressable } from '../ui/Pressable'
import { useSaveEvent } from './useEvents'
import { colors, radius, spacing } from './scheduleUtils'
import { DatePickerField } from './DatePickerField'
import type { Event } from './types'

// ─── 날짜/시간 헬퍼 ──────────────────────────────────────────────────────────

function splitISO(iso: string | null | undefined): { date: Date | null; time: string } {
  if (!iso) return { date: null, time: '' }
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return { date: d, time: `${hh}:${mm}` }
}

function parseTime(t: string): { hh: number; mm: number } | null {
  const match = t.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hh = Number(match[1])
  const mm = Number(match[2])
  return hh <= 23 && mm <= 59 ? { hh, mm } : null
}

function combineDateTime(date: Date, timeStr: string): Date {
  const parsed = parseTime(timeStr)
  const result = new Date(date)
  result.setHours(parsed?.hh ?? 0, parsed?.mm ?? 0, 0, 0)
  return result
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  channelId?: string
  clubId?: string
  event?: Event
  onSaved: (eventId: string) => void
  onCancel: () => void
}

// ─── 폼 상태 ──────────────────────────────────────────────────────────────────

interface FormState {
  title: string
  startsDate: Date | null
  startsTime: string
  endsDate: Date | null
  endsTime: string
  location: string
  description: string
}

interface FormErrors {
  title?: string
  startsDate?: string
  startsTime?: string
  endsDate?: string
  endsTime?: string
}

// ─── 유효성 검사 ──────────────────────────────────────────────────────────────

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {}

  if (!form.title.trim()) {
    errors.title = '제목을 입력해주세요.'
  }

  if (!form.startsDate) {
    errors.startsDate = '시작 날짜를 선택해주세요.'
  }

  if (!form.startsTime.trim()) {
    errors.startsTime = '시작 시간을 입력해주세요.'
  } else if (!parseTime(form.startsTime)) {
    errors.startsTime = '올바른 형식이 아닙니다. (예: 14:30)'
  }

  if (form.endsDate) {
    if (!form.endsTime.trim()) {
      errors.endsTime = '종료 시간을 입력해주세요.'
    } else if (!parseTime(form.endsTime)) {
      errors.endsTime = '올바른 형식이 아닙니다. (예: 16:00)'
    } else if (!errors.startsDate && !errors.startsTime && form.startsDate) {
      const start = combineDateTime(form.startsDate, form.startsTime)
      const end = combineDateTime(form.endsDate, form.endsTime)
      if (end <= start) {
        errors.endsTime = '종료 일시는 시작 일시보다 뒤여야 합니다.'
      }
    }
  }

  return errors
}

// ─── 필드 컴포넌트 ────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <View style={fieldStyles.container}>
      <View style={fieldStyles.labelRow}>
        <Text style={fieldStyles.label}>{label}</Text>
        {required && <Text style={fieldStyles.required}>*</Text>}
      </View>
      {children}
      {error ? <Text style={fieldStyles.error}>{error}</Text> : null}
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  container: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  required: { color: colors.error, fontSize: 13, fontWeight: '600' },
  error: { fontSize: 12, color: colors.error },
})

// ─── 화면 ─────────────────────────────────────────────────────────────────────

export default function EventFormScreen({ channelId, clubId, event, onSaved, onCancel }: Props) {
  const isEditMode = event != null

  const startsInfo = splitISO(event?.starts_at)
  const endsInfo = splitISO(event?.ends_at)

  const [form, setForm] = useState<FormState>({
    title: event?.title ?? '',
    startsDate: startsInfo.date,
    startsTime: startsInfo.time,
    endsDate: endsInfo.date,
    endsTime: endsInfo.time,
    location: event?.location ?? '',
    description: event?.description ?? '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { saving, saveEvent } = useSaveEvent()
  const insets = useSafeAreaInsets()

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const k = key as string
      if (!(k in prev)) return prev
      const next = { ...prev }
      delete (next as Record<string, unknown>)[k]
      return next
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    setSubmitError(null)

    const payload = {
      channel_id: channelId ?? null,
      club_id: clubId ?? null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      starts_at: combineDateTime(form.startsDate!, form.startsTime).toISOString(),
      ends_at: form.endsDate
        ? combineDateTime(form.endsDate, form.endsTime).toISOString()
        : null,
      location: form.location.trim() || null,
    }

    const result = await saveEvent(payload, isEditMode ? event!.id : undefined)
    if (!result.ok) {
      setSubmitError(result.error ?? '저장에 실패했습니다.')
      return
    }
    onSaved(result.id!)
  }, [form, channelId, isEditMode, event, saveEvent, onSaved])

  const handleCancel = useCallback(() => {
    const hasInput =
      form.title.trim() || form.startsDate || form.location.trim() || form.description.trim()
    if (!hasInput) {
      onCancel()
      return
    }
    if (Platform.OS === 'web') {
      if (window.confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) onCancel()
    } else {
      Alert.alert('작성 취소', '작성 중인 내용이 사라집니다. 취소하시겠습니까?', [
        { text: '계속 작성', style: 'cancel' },
        { text: '취소', style: 'destructive', onPress: onCancel },
      ])
    }
  }, [form, onCancel])

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.md + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{isEditMode ? '일정 수정' : '새 일정'}</Text>
        </View>

        {/* 저장 오류 */}
        {submitError ? (
          <View style={styles.submitErrorBox}>
            <Text style={styles.submitErrorText}>{submitError}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          {/* 제목 */}
          <Field label="제목" required error={errors.title}>
            <TextInput
              style={[styles.input, errors.title && styles.inputError]}
              value={form.title}
              onChangeText={(v) => setField('title', v)}
              placeholder="일정 제목"
              placeholderTextColor={colors.textSecondary}
              maxLength={100}
              returnKeyType="next"
              accessibilityLabel="일정 제목"
            />
          </Field>

          {/* 시작 날짜 + 시간 */}
          <Field label="시작" required error={errors.startsDate ?? errors.startsTime}>
            <DatePickerField
              value={form.startsDate}
              onChange={(d: Date) => setField('startsDate', d)}
              placeholder="날짜 선택"
              hasError={!!errors.startsDate}
            />
            <TextInput
              style={[styles.input, errors.startsTime && styles.inputError]}
              value={form.startsTime}
              onChangeText={(v) => setField('startsTime', v)}
              placeholder="시간 (예: 14:30)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              accessibilityLabel="시작 시간"
            />
          </Field>

          {/* 종료 날짜 + 시간 (선택) */}
          {form.endsDate ? (
            <Field label="종료" error={errors.endsDate ?? errors.endsTime}>
              <View style={styles.endsRow}>
                <View style={styles.endsDateWrap}>
                  <DatePickerField
                    value={form.endsDate}
                    onChange={(d: Date) => setField('endsDate', d)}
                    placeholder="날짜 선택"
                    hasError={!!errors.endsDate}
                  />
                </View>
                <Pressable
                  style={styles.clearEndButton}
                  onPress={() => {
                    setField('endsDate', null)
                    setField('endsTime', '')
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="종료 일시 제거"
                >
                  <Text style={styles.clearEndText}>✕</Text>
                </Pressable>
              </View>
              <TextInput
                style={[styles.input, errors.endsTime && styles.inputError]}
                value={form.endsTime}
                onChangeText={(v) => setField('endsTime', v)}
                placeholder="시간 (예: 16:00)"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel="종료 시간"
              />
            </Field>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.addEndButton, pressed && styles.addEndButtonPressed]}
              onPress={() => setField('endsDate', form.startsDate ?? new Date())}
              accessibilityRole="button"
            >
              <Text style={styles.addEndButtonText}>+ 종료 일시 추가</Text>
            </Pressable>
          )}

          {/* 장소 */}
          <Field label="장소">
            <TextInput
              style={styles.input}
              value={form.location}
              onChangeText={(v) => setField('location', v)}
              placeholder="장소 (선택)"
              placeholderTextColor={colors.textSecondary}
              maxLength={200}
              returnKeyType="next"
              accessibilityLabel="장소 (선택)"
            />
          </Field>

          {/* 설명 */}
          <Field label="설명">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(v) => setField('description', v)}
              placeholder="설명 (선택)"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              maxLength={1000}
              textAlignVertical="top"
              accessibilityLabel="설명 (선택)"
            />
            <Text style={styles.charCount}>{form.description.length} / 1000</Text>
          </Field>
        </View>

        {/* 하단 버튼 */}
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
            onPress={handleCancel}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.cancelButtonText}>취소</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.saveButtonDisabled,
              pressed && !saving && styles.saveButtonPressed,
            ]}
            onPress={handleSubmit}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>
                {isEditMode ? '수정 완료' : '일정 저장'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    ...Platform.select({
      web: { maxWidth: 640, alignSelf: 'center', width: '100%' } as object,
      default: {},
    }),
  },

  header: { paddingVertical: spacing.sm },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },

  submitErrorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  submitErrorText: { color: colors.error, fontSize: 14 },

  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } as object,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSecondary,
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
      default: {},
    }),
  },
  inputError: { borderColor: colors.error },
  textArea: { height: 100, paddingTop: spacing.sm },
  charCount: { fontSize: 11, color: colors.textSecondary, textAlign: 'right' },

  endsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  endsDateWrap: { flex: 1 },
  clearEndButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearEndText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },

  addEndButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addEndButtonPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  addEndButtonText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelButtonPressed: { backgroundColor: colors.border },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  saveButton: {
    flex: 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonPressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.97 }] },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
