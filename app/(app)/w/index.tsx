// depth 0 — 동아리 미선택. 넓은 화면: 레일 + 320px 동아리 목록 + 빈 본문 안내.
// 컴팩트 화면: 동아리 목록이 곧 화면 전체(레일 생략).
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/features/auth/useAuth'
import { useProfile } from '@/features/auth/useProfile'
import { useToast } from '@/features/ui/Toast'
import { colors } from '@/features/ui/theme'
import {
  ClubListPane,
  IconRail,
  JoinByCodeSheet,
  Pane,
  PaneGroup,
  ProfileEditSheet,
  UserAvatarMark,
  useBreakpoint,
  useWorkspaceData,
  useWorkspaceNavigation,
} from '@/features/shell'

export default function WorkspaceIndexScreen() {
  const { isCompact } = useBreakpoint()
  const router = useRouter()
  const { clubs, clubsLoading, refreshClubs } = useWorkspaceData()
  const { openClub } = useWorkspaceNavigation()
  const { user } = useAuth()
  const { profile, refresh: refreshProfile } = useProfile(user?.id)
  const { show: showToast, ToastComponent } = useToast()

  const [joinVisible, setJoinVisible] = useState(false)
  const [profileVisible, setProfileVisible] = useState(false)

  function handleJoined(clubName: string) {
    refreshClubs()
    showToast(`${clubName} 동아리에 가입했어요 ✓`)
  }

  const sheets = (
    <>
      <ToastComponent />
      <JoinByCodeSheet visible={joinVisible} onClose={() => setJoinVisible(false)} onJoined={handleJoined} />
      <ProfileEditSheet
        visible={profileVisible}
        profile={profile}
        onClose={() => setProfileVisible(false)}
        onSaved={() => refreshProfile()}
      />
    </>
  )

  if (isCompact) {
    return (
      <View style={styles.fill}>
        {sheets}
        <ClubListPane
          clubs={clubs}
          loading={clubsLoading}
          onPressClub={openClub}
          onPressCreateClub={() => router.push('/(app)/clubs/create')}
          onPressJoin={() => setJoinVisible(true)}
          headerRight={
            <Pressable
              onPress={() => setProfileVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="프로필 편집"
            >
              <UserAvatarMark profile={profile} />
            </Pressable>
          }
        />
      </View>
    )
  }

  return (
    <View style={styles.fill}>
      {sheets}
      <PaneGroup>
        <IconRail />
        <Pane width={320}>
          <ClubListPane
            clubs={clubs}
            loading={clubsLoading}
            onPressClub={openClub}
            onPressCreateClub={() => router.push('/(app)/clubs/create')}
            onPressJoin={() => setJoinVisible(true)}
          />
        </Pane>
        <View style={styles.emptyMain}>
          <Text style={styles.emptyMainText}>동아리를 선택하세요</Text>
        </View>
      </PaneGroup>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  emptyMain: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  emptyMainText: { fontSize: 15, color: colors.textSecondary, fontWeight: '500' },
})
