// ─── 동아리 목록 패널 ────────────────────────────────────────────────────────────
// app/(app)/index.tsx의 ClubCard + FlatList 렌더링을 그대로 추출한 것(시각적으로
// 동일하게 유지). 두 군데서 재사용된다:
//  (a) 넓은 화면에서 레일 옆의 320px 목록 컬럼 (activeClubId로 현재 동아리를 강조)
//  (b) 컴팩트 화면의 depth-0 메인 콘텐츠(레일 없이 풀폭)
//
// 스펙에 명시된 필수 prop 외에, 두 재사용처를 모두 지원하기 위해 다음을 추가했다
// (둘 다 선택적 prop이라 기본 사용에는 영향이 없다):
//  - activeClubId?: 목록 컬럼으로 쓰일 때 현재 선택된 동아리를 강조 표시
//  - headerRight?: 컴팩트 모드에서는 레일이 없어 프로필 편집 진입점이 사라지므로,
//    호출부(app/(app)/w/index.tsx)가 이 슬롯에 프로필 아바타 버튼을 꽂아 넣을 수 있게 함

import { ReactNode } from 'react'
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, View } from 'react-native'
import { Pressable } from '../ui/Pressable'
import { colors, radius, shadows } from '../ui/theme'
import { getClubColor } from './shellUtils'
import type { WorkspaceClub } from './useWorkspaceData'

type MemberRole = WorkspaceClub['role']

const ROLE_LABEL: Record<MemberRole, string> = { owner: '방장', admin: '관리자', member: '멤버' }
const ROLE_COLOR: Record<MemberRole, { bg: string; text: string }> = {
  owner: { bg: '#E7EFFF', text: '#3B7DD8' },
  admin: { bg: '#E8F7EE', text: '#1FA65A' },
  member: { bg: '#F2F4F6', text: '#6B7684' },
}

function RoleBadge({ role }: { role: MemberRole }) {
  const c = ROLE_COLOR[role] ?? ROLE_COLOR.member
  return (
    <View style={[styles.roleBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.roleBadgeText, { color: c.text }]}>{ROLE_LABEL[role] ?? role}</Text>
    </View>
  )
}

function ClubCard({
  item,
  active,
  onPress,
}: {
  item: WorkspaceClub
  active: boolean
  onPress: () => void
}) {
  const color = getClubColor(item.id)
  const firstChar = item.name[0]?.toUpperCase() ?? '?'
  return (
    <Pressable
      style={({ pressed }) => [styles.clubCard, active && styles.clubCardActive, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} 동아리 열기`}
    >
      <View style={[styles.clubBadge, { backgroundColor: color.bg }]}>
        <Text style={[styles.clubBadgeText, { color: color.text }]}>{firstChar}</Text>
      </View>
      <View style={styles.clubInfo}>
        <View style={styles.clubNameRow}>
          <Text style={styles.clubName} numberOfLines={1}>{item.name}</Text>
          <RoleBadge role={item.role} />
        </View>
        <Text style={styles.clubSub}>
          방 {item.channelCount}개 · 멤버 {item.memberCount}명
        </Text>
      </View>
      {item.unreadCount > 0 ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
          </Text>
        </View>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  )
}

interface ClubListPaneProps {
  clubs: WorkspaceClub[]
  loading: boolean
  onPressClub: (clubId: string) => void
  onPressCreateClub: () => void
  onPressJoin: () => void
  activeClubId?: string
  headerRight?: ReactNode
}

export function ClubListPane({
  clubs,
  loading,
  onPressClub,
  onPressCreateClub,
  onPressJoin,
  activeClubId,
  headerRight,
}: ClubListPaneProps) {
  return (
    <View style={styles.container}>
      <FlatList
        data={clubs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={clubs.length === 0 ? styles.emptyContainer : styles.listContent}
        ListHeaderComponent={
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>내 동아리</Text>
            {headerRight}
          </View>
        }
        renderItem={({ item, index }) => (
          <>
            {index === 0 && (
              <Text style={styles.sectionLabel}>가입한 동아리 {clubs.length}</Text>
            )}
            <ClubCard
              item={item}
              active={item.id === activeClubId}
              onPress={() => onPressClub(item.id)}
            />
          </>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.loadingIndicator} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>아직 동아리가 없어요</Text>
              <Text style={styles.emptySubtitle}>동아리를 만들거나 초대 코드로 가입해보세요.</Text>
            </View>
          )
        }
      />

      <View style={styles.bottomButtons}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={onPressCreateClub}
          accessibilityRole="button"
          accessibilityLabel="동아리 만들기"
        >
          <Text style={styles.primaryBtnText}>+ 동아리 만들기</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
          onPress={onPressJoin}
          accessibilityRole="button"
          accessibilityLabel="초대 코드로 가입"
        >
          <Text style={styles.outlineBtnText}>초대 코드로 가입</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  pageTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, paddingHorizontal: 20, paddingBottom: 8 },

  listContent: { paddingHorizontal: 20, paddingBottom: 120, gap: 10 },
  emptyContainer: { flex: 1 },

  clubCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...shadows.card,
  },
  clubCardActive: { borderWidth: 1.5, borderColor: colors.primary },
  clubBadge: {
    width: 50, height: 50, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  clubBadgeText: { fontSize: 22, fontWeight: '800' },
  clubInfo: { flex: 1, gap: 3 },
  clubNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  clubName: { fontSize: 16, fontWeight: '700', color: colors.text },
  clubSub: { fontSize: 13, color: colors.textSecondary },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  unreadBadge: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  chevron: { fontSize: 18, color: '#C4CAD2', fontWeight: '300' },

  loadingIndicator: { marginTop: 60 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  bottomButtons: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  primaryBtn: {
    flex: 1, height: 50, borderRadius: radius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  primaryBtnPressed: {
    transform: [{ scale: 0.97 }],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
    opacity: 0.92,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  outlineBtn: {
    flex: 1, height: 50, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
})
