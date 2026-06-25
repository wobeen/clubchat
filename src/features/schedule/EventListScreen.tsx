import React, { useCallback } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, formatDatetime, radius, spacing, STATUS_COLOR, STATUS_LABEL } from './scheduleUtils'
import type { EventWithMyResponse } from './types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  events: EventWithMyResponse[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  /** 일정 상세 화면으로 이동 */
  onPressEvent: (eventId: string) => void
  /** 일정 생성 화면으로 이동 */
  onPressCreate: () => void
}

// ─── 목록 항목 ────────────────────────────────────────────────────────────────

interface EventCardProps {
  item: EventWithMyResponse
  onPress: () => void
}

const EventCard = React.memo(function EventCard({ item, onPress }: EventCardProps) {
  const hasBadge = item.myStatus !== null

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`일정: ${item.title}, ${formatDatetime(item.starts_at)}`}
    >
      {/* 왼쪽 강조 바 */}
      <View style={styles.accentBar} />

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {hasBadge && (
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLOR[item.myStatus!] },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {STATUS_LABEL[item.myStatus!]}
              </Text>
            </View>
          )}
          {!hasBadge && (
            <View style={[styles.statusBadge, styles.statusBadgeNone]}>
              <Text style={[styles.statusBadgeText, styles.statusBadgeTextNone]}>
                미응답
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.cardDate}>{formatDatetime(item.starts_at)}</Text>

        {item.location ? (
          <Text style={styles.cardLocation} numberOfLines={1}>
            {item.location}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
})

// ─── 빈 상태 ──────────────────────────────────────────────────────────────────

function EmptyState({ onPressCreate }: { onPressCreate: () => void }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📅</Text>
      <Text style={styles.emptyTitle}>다가오는 일정이 없어요</Text>
      <Text style={styles.emptyBody}>첫 번째 일정을 만들어 멤버들과 공유해보세요.</Text>
      <Pressable
        style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
        onPress={onPressCreate}
        accessibilityRole="button"
      >
        <Text style={styles.emptyButtonText}>일정 만들기</Text>
      </Pressable>
    </View>
  )
}

// ─── 화면 ─────────────────────────────────────────────────────────────────────

export default function EventListScreen({
  events,
  loading,
  error,
  onRefresh,
  onPressEvent,
  onPressCreate,
}: Props) {

  const renderItem = useCallback(
    ({ item }: { item: EventWithMyResponse }) => (
      <EventCard item={item} onPress={() => onPressEvent(item.id)} />
    ),
    [onPressEvent]
  )

  const keyExtractor = useCallback((item: EventWithMyResponse) => item.id, [])

  // 헤더: 우상단 생성 버튼 — 네비게이션 라이브러리와 무관하게 화면 내에 배치
  const Header = (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>일정</Text>
      <Pressable
        style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
        onPress={onPressCreate}
        accessibilityRole="button"
        accessibilityLabel="새 일정 만들기"
      >
        <Text style={styles.createButtonText}>+ 새 일정</Text>
      </Pressable>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        {Header}
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.centered}>
        {Header}
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          onPress={onRefresh}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {Header}
      <FlatList
        data={events}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={events.length === 0 ? styles.flatListEmpty : styles.flatListContent}
        ListEmptyComponent={<EmptyState onPressCreate={onPressCreate} />}
        onRefresh={onRefresh}
        refreshing={loading}
        // Web에서 스크롤 성능 개선
        removeClippedSubviews={Platform.OS !== 'web'}
      />
    </View>
  )
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
  },
  spinner: {
    flex: 1,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  createButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // 카드
  flatListContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  flatListEmpty: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    // Web shadow
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
  cardPressed: {
    opacity: 0.85,
  },
  accentBar: {
    width: 4,
    backgroundColor: colors.primary,
  },
  cardContent: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusBadgeNone: {
    backgroundColor: colors.border,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadgeTextNone: {
    color: colors.textSecondary,
  },
  cardDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  cardLocation: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // 에러
  errorText: {
    textAlign: 'center',
    color: colors.error,
    marginTop: spacing.xl,
    fontSize: 14,
  },
  retryButton: {
    alignSelf: 'center',
    marginTop: spacing.md,
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

  // 빈 상태
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  emptyButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
})
