import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Pressable } from '../ui/Pressable'
import { useEventDetail } from './useEvents'
import {
  colors,
  formatDatetime,
  radius,
  spacing,
  STATUS_COLOR,
  STATUS_LABEL,
} from './scheduleUtils'
import type { EventResponseWithProfile, ResponseStatus } from './types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  eventId: string
  /** 현재 로그인 사용자 ID */
  currentUserId: string
  /** 수정 화면으로 이동 */
  onPressEdit: (eventId: string) => void
  /** 삭제 후 목록으로 돌아감 */
  onDeleted: () => void
  /** 뒤로 가기 */
  onBack: () => void
}

// ─── 집계 바 ──────────────────────────────────────────────────────────────────

interface CountBarProps {
  going: number
  not_going: number
  maybe: number
}

function CountBar({ going, not_going, maybe }: CountBarProps) {
  const total = going + not_going + maybe

  return (
    <View style={styles.countContainer}>
      <CountChip label="참석" count={going} color={STATUS_COLOR.going} />
      <CountChip label="불참" count={not_going} color={STATUS_COLOR.not_going} />
      <CountChip label="미정" count={maybe} color={STATUS_COLOR.maybe} />
      {total > 0 && (
        <Text style={styles.totalText}>총 {total}명 응답</Text>
      )}
    </View>
  )
}

function CountChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.countChip}>
      <View style={[styles.countDot, { backgroundColor: color }]} />
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={[styles.countNumber, { color }]}>{count}명</Text>
    </View>
  )
}

// ─── 응답자 목록 ──────────────────────────────────────────────────────────────

function ResponderGroup({
  status,
  responses,
}: {
  status: ResponseStatus
  responses: EventResponseWithProfile[]
}) {
  if (responses.length === 0) return null

  return (
    <View style={styles.responderGroup}>
      <View style={styles.responderGroupHeader}>
        <View style={[styles.countDot, { backgroundColor: STATUS_COLOR[status] }]} />
        <Text style={[styles.responderGroupLabel, { color: STATUS_COLOR[status] }]}>
          {STATUS_LABEL[status]} {responses.length}명
        </Text>
      </View>
      <View style={styles.responderChipRow}>
        {responses.map((r) => (
          <View key={r.id} style={styles.responderChip}>
            {r.profile?.avatar_emoji && (
              <Text style={styles.responderChipEmoji}>{r.profile.avatar_emoji}</Text>
            )}
            <Text style={styles.responderChipText} numberOfLines={1}>
              {r.profile?.display_name ?? '알 수 없음'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function ResponderList({ responses }: { responses: EventResponseWithProfile[] }) {
  if (responses.length === 0) {
    return <Text style={styles.noResponsesText}>아직 응답한 사람이 없어요</Text>
  }

  const byStatus = (status: ResponseStatus) => responses.filter((r) => r.status === status)

  return (
    <View style={styles.responderList}>
      <ResponderGroup status="going" responses={byStatus('going')} />
      <ResponderGroup status="maybe" responses={byStatus('maybe')} />
      <ResponderGroup status="not_going" responses={byStatus('not_going')} />
    </View>
  )
}

// ─── 응답 버튼 그룹 ───────────────────────────────────────────────────────────

interface ResponseButtonsProps {
  myStatus: ResponseStatus | null
  submitting: boolean
  onSelect: (status: ResponseStatus) => void
}

function ResponseButtons({ myStatus, submitting, onSelect }: ResponseButtonsProps) {
  const statuses: ResponseStatus[] = ['going', 'not_going', 'maybe']

  return (
    <View style={styles.responseRow}>
      {statuses.map((s) => {
        const selected = myStatus === s
        return (
          <Pressable
            key={s}
            style={({ pressed }) => [
              styles.responseButton,
              selected && { backgroundColor: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] },
              pressed && styles.responseButtonPressed,
            ]}
            onPress={() => onSelect(s)}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={STATUS_LABEL[s]}
          >
            <Text
              style={[
                styles.responseButtonText,
                selected && styles.responseButtonTextSelected,
              ]}
            >
              {STATUS_LABEL[s]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ─── 화면 ─────────────────────────────────────────────────────────────────────

export default function EventDetailScreen({
  eventId,
  currentUserId,
  onPressEdit,
  onDeleted,
  onBack,
}: Props) {
  const { event, responses, myStatus, counts, loading, error, upsertResponse, deleteEvent, refresh } =
    useEventDetail(eventId)

  const [submitting, setSubmitting] = useState(false)
  const [responseError, setResponseError] = useState<string | null>(null)
  const insets = useSafeAreaInsets()

  const isAuthor = event !== null && event.created_by === currentUserId

  const handleResponse = useCallback(
    async (status: ResponseStatus) => {
      setSubmitting(true)
      setResponseError(null)
      try {
        await upsertResponse(status)
      } catch (err) {
        setResponseError('응답 저장에 실패했습니다. 다시 시도해주세요.')
      } finally {
        setSubmitting(false)
      }
    },
    [upsertResponse]
  )

  const handleDelete = useCallback(() => {
    // Web에서 window.confirm, Native에서 Alert 사용
    if (Platform.OS === 'web') {
      if (!window.confirm('이 일정을 삭제하시겠습니까? 모든 응답이 함께 삭제됩니다.')) return
      void doDelete()
    } else {
      Alert.alert('일정 삭제', '이 일정을 삭제하시겠습니까?\n모든 응답이 함께 삭제됩니다.', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void doDelete() },
      ])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function doDelete() {
    const result = await deleteEvent()
    if (result.ok) {
      onDeleted()
    } else {
      if (Platform.OS === 'web') {
        window.alert(result.error ?? '삭제에 실패했습니다.')
      } else {
        Alert.alert('오류', result.error ?? '삭제에 실패했습니다.')
      }
    }
  }

  // ── 로딩 ─────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  // ── 에러 ─────────────────────────────────────────────────────────────────────
  if (error || !event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? '일정을 찾을 수 없습니다.'}</Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          onPress={error ? refresh : onBack}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>{error ? '다시 시도' : '돌아가기'}</Text>
        </Pressable>
      </View>
    )
  }

  // ── 정상 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.md + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* 제목 + 수정/삭제 */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>{event.title}</Text>
        {isAuthor && (
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={() => onPressEdit(event.id)}
              accessibilityRole="button"
              accessibilityLabel="일정 수정"
            >
              <Text style={styles.actionButtonText}>수정</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.deleteButton,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="일정 삭제"
            >
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>삭제</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* 날짜·시각 */}
      <InfoRow icon="🗓" label="시작">
        <Text style={styles.infoValue}>{formatDatetime(event.starts_at)}</Text>
      </InfoRow>
      {event.ends_at && (
        <InfoRow icon="⏰" label="종료">
          <Text style={styles.infoValue}>{formatDatetime(event.ends_at)}</Text>
        </InfoRow>
      )}

      {/* 장소 */}
      {event.location && (
        <InfoRow icon="📍" label="장소">
          <Text style={styles.infoValue}>{event.location}</Text>
        </InfoRow>
      )}

      {/* 설명 */}
      {event.description && (
        <View style={styles.descriptionBox}>
          <Text style={styles.sectionLabel}>설명</Text>
          <Text style={styles.descriptionText}>{event.description}</Text>
        </View>
      )}

      {/* 참석 집계 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>참석 현황</Text>
        <CountBar
          going={counts.going}
          not_going={counts.not_going}
          maybe={counts.maybe}
        />
        <ResponderList responses={responses} />
      </View>

      {/* 내 응답 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>내 참석 여부</Text>
        {responseError && <Text style={styles.responseErrorText}>{responseError}</Text>}
        <ResponseButtons
          myStatus={myStatus}
          submitting={submitting}
          onSelect={handleResponse}
        />
        {submitting && (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={styles.submittingIndicator}
          />
        )}
      </View>
    </ScrollView>
  )
}

// ─── 공통 InfoRow ─────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: string
  label: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon} accessibilityLabel={label}>
        {icon}
      </Text>
      {children}
    </View>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
  },

  // 제목 영역
  titleRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 28,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  deleteButton: {
    borderColor: colors.destructive,
  },
  deleteButtonText: {
    color: colors.destructive,
  },

  // 정보 행
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  infoIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  infoValue: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // 설명
  descriptionBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  descriptionText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // 섹션 공통
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // 집계
  countContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.full,
  },
  countDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  countLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  countNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  totalText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 'auto',
  },

  responderList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  noResponsesText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  responderGroup: {
    gap: spacing.xs,
  },
  responderGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  responderGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  responderChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  responderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSecondary,
    maxWidth: 140,
  },
  responderChipEmoji: {
    fontSize: 13,
  },
  responderChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // 응답 버튼
  responseRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  responseButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  responseButtonPressed: {
    opacity: 0.75,
  },
  responseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  responseButtonTextSelected: {
    color: '#fff',
  },
  responseErrorText: {
    fontSize: 13,
    color: colors.error,
  },
  submittingIndicator: {
    marginTop: spacing.xs,
  },

  // 에러/재시도
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  retryButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
})
