import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSaveEvent } from './useEvents'
import { colors, radius, spacing } from './scheduleUtils'
import type { Event } from './types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  channelId: string
  /** 수정 모드일 때만 존재 */
  event?: Event
  onSaved: (eventId: string) => void
  onCancel: () => void
}

// ─── 폼 상태 타입 ─────────────────────────────────────────────────────────────

interface FormState {
  title: string
  startsAt: string
  endsAt: string
  location: string
  description: string
}

interface FormErrors {
  title?: string
  startsAt?: string
  endsAt?: string
}

// ─── 날짜 입력 힌트 ───────────────────────────────────────────────────────────
// 플랫폼별 DatePicker 통합은 추후 단계. 현재는 텍스트 필드.
// 사용자가 "2026-06-23 15:00" 형식으로 입력하면 ISO 8601로 정규화 후 검증.
const DATE_PLACEHOLDER = '예: 2026-06-23 15:00'

// "2026-06-23 15:00" → Date 변환.
// iOS/Safari는 공백 구분자를 NaN으로 파싱하므로 T로 교체해 로컬 시간으로 해석시킨다.
function parseLocalDate(s: string): Date {
  return new Date(s.trim().replace(' ', 'T'))
}

// ─── 유효성 검사 ──────────────────────────────────────────────────────────────

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {}

  if (!form.title.trim()) {
    errors.title = '제목을 입력해주세요.'
  }

  if (!form.startsAt.trim()) {
    errors.startsAt = '시작 일시를 입력해주세요.'
  } else if (isNaN(parseLocalDate(form.startsAt).getTime())) {
    errors.startsAt = '올바른 날짜 형식이 아닙니다. (예: 2026-06-23 15:00)'
  }

  if (form.endsAt.trim()) {
    if (isNaN(parseLocalDate(form.endsAt).getTime())) {
      errors.endsAt = '올바른 날짜 형식이 아닙니다.'
    } else if (
      !errors.startsAt &&
      parseLocalDate(form.endsAt) <= parseLocalDate(form.startsAt)
    ) {
      errors.endsAt = '종료 일시는 시작 일시보다 뒤여야 합니다.'
    }
  }

  return errors
}

// ─── 입력 필드 컴포넌트 ──────────────────────────────────────────────────────

interface FieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

function Field({ label, required, error, children }: FieldProps) {
  return (
    <View style={fieldStyles.container}>
      <View style={fieldStyles.labelRow}>
        <Text style={fieldStyles.label}>{label}</Text>
        {required && <Text style={fieldStyles.required}>*</Text>}
      </View>
      {children}
      {error && <Text style={fieldStyles.error}>{error}</Text>}
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  required: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    fontSize: 12,
    color: colors.error,
  },
})

// ─── 화면 ─────────────────────────────────────────────────────────────────────

export default function EventFormScreen({ channelId, event, onSaved, onCancel }: Props) {
  const isEditMode = event !== null && event !== undefined

  // ISO 문자열에서 로컬 입력용 문자열로 변환 (단순 파싱 — DatePicker 통합 전 임시)
  const toLocalInput = (iso: string | null | undefined): string => {
    if (!iso) return ''
    const d = new Date(iso)
    // "YYYY-MM-DD HH:mm" 형태
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [form, setForm] = useState<FormState>({
    title: event?.title ?? '',
    startsAt: toLocalInput(event?.starts_at),
    endsAt: toLocalInput(event?.ends_at),
    location: event?.location ?? '',
    description: event?.description ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { saving, saveEvent } = useSaveEvent()

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // 타이핑 중 해당 필드 에러 제거
    setErrors((prev) => {
      if (!prev[key as keyof FormErrors]) return prev
      const next = { ...prev }
      delete next[key as keyof FormErrors]
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
      channel_id: channelId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      starts_at: parseLocalDate(form.startsAt).toISOString(),
      ends_at: form.endsAt.trim() ? parseLocalDate(form.endsAt).toISOString() : null,
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
    // 입력값이 있을 때 확인 다이얼로그
    const hasInput =
      form.title.trim() ||
      form.startsAt.trim() ||
      form.location.trim() ||
      form.description.trim()

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
    // KeyboardAvoidingView: iOS에서 키보드가 올라올 때 스크롤 영역 보정
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isEditMode ? '일정 수정' : '새 일정'}
          </Text>
        </View>

        {/* 전체 저장 에러 */}
        {submitError && (
          <View style={styles.submitErrorBox}>
            <Text style={styles.submitErrorText}>{submitError}</Text>
          </View>
        )}

        {/* 폼 필드들 */}
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

          {/* 시작 일시 */}
          <Field label="시작 일시" required error={errors.startsAt}>
            <TextInput
              style={[styles.input, errors.startsAt && styles.inputError]}
              value={form.startsAt}
              onChangeText={(v) => setField('startsAt', v)}
              placeholder={DATE_PLACEHOLDER}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
              accessibilityLabel="시작 일시"
            />
          </Field>

          {/* 종료 일시 */}
          <Field label="종료 일시" error={errors.endsAt}>
            <TextInput
              style={[styles.input, errors.endsAt && styles.inputError]}
              value={form.endsAt}
              onChangeText={(v) => setField('endsAt', v)}
              placeholder={DATE_PLACEHOLDER + ' (선택)'}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
              accessibilityLabel="종료 일시 (선택)"
            />
          </Field>

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
            accessibilityLabel="취소"
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
            accessibilityLabel={isEditMode ? '수정 완료' : '일정 저장'}
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
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    // Web에서 최대 너비 제한 (가독성)
    ...Platform.select({
      web: { maxWidth: 640, alignSelf: 'center', width: '100%' },
      default: {},
    }),
  },

  // 헤더
  header: {
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // 에러 배너
  submitErrorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  submitErrorText: {
    color: colors.error,
    fontSize: 14,
  },

  // 폼
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },

  // 입력 필드
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSecondary,
    // Web에서 outline 제거
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
      default: {},
    }),
  },
  inputError: {
    borderColor: colors.error,
  },
  textArea: {
    height: 100,
    paddingTop: spacing.sm,
  },
  charCount: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
  },

  // 버튼 행
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelButtonPressed: {
    backgroundColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
})
