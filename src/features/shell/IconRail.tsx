// ─── 72px 아이콘 레일 ────────────────────────────────────────────────────────────
// 컴팩트 화면에서는 호출부(route 파일)가 아예 렌더링하지 않는다 — 한 번에 한 패널만
// 보여주는 컴팩트 모드에서는 레일이 화면 폭을 잡아먹기 때문("compact 모드에서는
// 아예 생략" — 스펙 원문).

import { useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Pressable } from '../ui/Pressable'
import { useAuth } from '../auth/useAuth'
import { useProfile, ProfileRow } from '../auth/useProfile'
import { useToast } from '../ui/Toast'
import { colors } from '../ui/theme'
import { useWorkspaceData, WorkspaceClub } from './useWorkspaceData'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'
import { getClubColor, getInitials } from './shellUtils'
import { ProfileEditSheet } from './ProfileEditSheet'
import { JoinByCodeSheet } from './JoinByCodeSheet'

export const RAIL_WIDTH = 72

export function IconRail() {
  const { user } = useAuth()
  const { profile, refresh: refreshProfile } = useProfile(user?.id)
  const { clubs, clubsLoading, refreshClubs } = useWorkspaceData()
  const { clubId: activeClubId, openClub } = useWorkspaceNavigation()

  const [profileVisible, setProfileVisible] = useState(false)
  const [joinVisible, setJoinVisible] = useState(false)
  const { show: showToast, ToastComponent } = useToast()

  return (
    <View style={styles.rail}>
      <ToastComponent />

      <ProfileEditSheet
        visible={profileVisible}
        profile={profile}
        onClose={() => setProfileVisible(false)}
        onSaved={() => refreshProfile()}
      />
      <JoinByCodeSheet
        visible={joinVisible}
        onClose={() => setJoinVisible(false)}
        onJoined={(clubName) => {
          refreshClubs()
          showToast(`${clubName} 동아리에 가입했어요 ✓`)
        }}
      />

      {/* 앱 마크 */}
      <View style={styles.logoMark}>
        <Text style={styles.logoMarkText}>C</Text>
      </View>

      {/* 동아리 아바타 목록 */}
      <ScrollView
        style={styles.clubScroll}
        contentContainerStyle={styles.clubScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {clubsLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        ) : (
          clubs.map((club) => (
            <ClubAvatarButton
              key={club.id}
              club={club}
              active={club.id === activeClubId}
              onPress={() => openClub(club.id)}
            />
          ))
        )}

        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          onPress={() => setJoinVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="초대 코드로 동아리 가입"
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </ScrollView>

      {/* 프로필 */}
      <Pressable
        style={({ pressed }) => [styles.profileBtn, pressed && styles.pressed]}
        onPress={() => setProfileVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="프로필 편집"
      >
        <UserAvatarMark profile={profile} />
      </Pressable>
    </View>
  )
}

function ClubAvatarButton({
  club,
  active,
  onPress,
}: {
  club: WorkspaceClub
  active: boolean
  onPress: () => void
}) {
  const color = getClubColor(club.id)
  const firstChar = club.name[0]?.toUpperCase() ?? '?'
  return (
    <Pressable
      style={({ pressed }) => [styles.clubBtn, active && styles.clubBtnActive, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${club.name} 열기`}
    >
      <View style={[styles.clubAvatar, { backgroundColor: color.bg }]}>
        <Text style={[styles.clubAvatarText, { color: color.text }]}>{firstChar}</Text>
      </View>
      {club.unreadCount > 0 && <View style={styles.dot} />}
    </Pressable>
  )
}

// 컴팩트 depth-0(app/(app)/w/index.tsx)의 ClubListPane 헤더에도 같은 아바타가
// 필요해서(레일이 없으니 프로필 편집 진입점을 헤더에 둬야 함) export한다.
export function UserAvatarMark({ profile }: { profile: ProfileRow | null }) {
  if (profile?.avatar_emoji) {
    return (
      <View style={[styles.userAvatar, { backgroundColor: '#FFF3E0' }]}>
        <Text style={{ fontSize: 18 }}>{profile.avatar_emoji}</Text>
      </View>
    )
  }
  const initials = getInitials(profile?.display_name ?? '?')
  return (
    <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
      <Text style={styles.userAvatarText}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderLight,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoMarkText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },

  clubScroll: { flex: 1, width: '100%' },
  clubScrollContent: { alignItems: 'center', gap: 10, paddingBottom: 12 },
  loader: { marginTop: 8 },

  clubBtn: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  clubBtnActive: { backgroundColor: '#E7EFFF' },
  clubAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  clubAvatarText: { fontSize: 18, fontWeight: '800' },
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.background,
  },

  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 20, fontWeight: '600', color: colors.textSecondary },

  profileBtn: { marginTop: 8 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  pressed: { opacity: 0.7 },
})
