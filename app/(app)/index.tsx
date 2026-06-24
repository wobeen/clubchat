import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { useAuth } from '../../src/features/auth/useAuth'
import { Database } from '../../src/types/supabase'

type Profile = Database['public']['Tables']['profiles']['Row']
type MemberRole = 'owner' | 'admin' | 'member'

interface ClubItem {
  membershipId: string
  clubId: string
  clubName: string
  role: MemberRole
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clubs: ClubItem[]; profile: Profile | null }

function getInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: '방장',
  admin: '관리자',
  member: '멤버',
}

const ROLE_COLOR: Record<MemberRole, { bg: string; text: string }> = {
  owner: { bg: '#DBEAFE', text: '#1D4ED8' },
  admin: { bg: '#DCFCE7', text: '#15803D' },
  member: { bg: '#F3F4F6', text: '#6B7280' },
}

function RoleBadge({ role }: { role: MemberRole }) {
  const colors = ROLE_COLOR[role] ?? ROLE_COLOR.member
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{ROLE_LABEL[role] ?? role}</Text>
    </View>
  )
}

function ClubListItem({ item }: { item: ClubItem }) {
  return (
    <View style={styles.clubCard}>
      <View style={styles.clubAvatarPlaceholder}>
        <Text style={styles.clubAvatarText}>{item.clubName[0]?.toUpperCase() ?? '?'}</Text>
      </View>
      <View style={styles.clubInfo}>
        <Text style={styles.clubName} numberOfLines={1}>{item.clubName}</Text>
      </View>
      <RoleBadge role={item.role} />
    </View>
  )
}

export default function ClubListScreen() {
  const { session } = useAuth()
  const router = useRouter()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [signingOut, setSigningOut] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (!session?.user) return

      let cancelled = false

      async function load() {
        if (!session?.user) return
        setState({ status: 'loading' })

        const [profileResult, membershipsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, display_name, avatar_url, created_at')
            .eq('id', session.user.id)
            .maybeSingle(),
          supabase
            .from('memberships')
            .select('id, role, club_id, clubs(id, name)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: true }),
        ])

        if (cancelled) return

        if (profileResult.error) {
          console.error('[ClubListScreen] profile error:', profileResult.error)
          setState({ status: 'error', message: '프로필을 불러오는 중 오류가 발생했습니다.' })
          return
        }

        if (membershipsResult.error) {
          console.error('[ClubListScreen] memberships error:', membershipsResult.error)
          setState({ status: 'error', message: '동아리 목록을 불러오는 중 오류가 발생했습니다.' })
          return
        }

        const clubs: ClubItem[] = (membershipsResult.data ?? []).flatMap((m) => {
          const clubData = m.clubs as { id: string; name: string } | null
          if (!clubData) return []
          const role = (m.role as MemberRole) ?? 'member'
          return [{
            membershipId: m.id,
            clubId: clubData.id,
            clubName: clubData.name,
            role,
          }]
        })

        setState({ status: 'ready', clubs, profile: profileResult.data })
      }

      load()

      return () => { cancelled = true }
    }, [session?.user?.id])
  )

  async function handleSignOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('[ClubListScreen] signOut error:', error)
    }
    setSigningOut(false)
  }

  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => setState({ status: 'loading' })}
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const { clubs, profile } = state
  const displayName = profile?.display_name ?? '사용자'
  const initials = getInitials(displayName)

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.headerAvatar}
              accessibilityLabel={`${displayName}의 프로필 사진`}
            />
          ) : (
            <View style={styles.headerAvatarPlaceholder} accessibilityLabel={`${displayName}의 이니셜 아바타`}>
              <Text style={styles.headerAvatarInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            (pressed || signingOut) && styles.pressedOpacity,
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
          accessibilityState={{ disabled: signingOut }}
        >
          {signingOut
            ? <ActivityIndicator size="small" color="#DC2626" />
            : <Text style={styles.signOutText}>로그아웃</Text>
          }
        </Pressable>
      </View>

      {/* 동아리 목록 */}
      <FlatList
        data={clubs}
        keyExtractor={(item) => item.membershipId}
        contentContainerStyle={clubs.length === 0 ? styles.emptyContainer : styles.listContent}
        renderItem={({ item }) => <ClubListItem item={item} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>아직 동아리가 없어요</Text>
            <Text style={styles.emptySubtitle}>동아리를 만들거나 초대 코드로 가입해보세요.</Text>
            <View style={styles.emptyActions}>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedOpacity]}
                onPress={() => router.push('/(app)/clubs/create')}
                accessibilityRole="button"
                accessibilityLabel="동아리 만들기"
              >
                <Text style={styles.primaryButtonText}>동아리 만들기</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedOpacity]}
                onPress={() => router.push('/(app)/clubs/join')}
                accessibilityRole="button"
                accessibilityLabel="동아리 가입하기"
              >
                <Text style={styles.secondaryButtonText}>초대 코드로 가입</Text>
              </Pressable>
            </View>
          </View>
        }
      />

      {/* FAB — 목록이 있을 때만 표시 */}
      {clubs.length > 0 && (
        <View style={styles.fab}>
          <Pressable
            style={({ pressed }) => [styles.fabButton, pressed && styles.pressedOpacity]}
            onPress={() => router.push('/(app)/clubs/create')}
            accessibilityRole="button"
            accessibilityLabel="동아리 만들기"
          >
            <Text style={styles.fabText}>+ 만들기</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.fabButtonSecondary, pressed && styles.pressedOpacity]}
            onPress={() => router.push('/(app)/clubs/join')}
            accessibilityRole="button"
            accessibilityLabel="동아리 가입하기"
          >
            <Text style={styles.fabTextSecondary}>가입</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const HEADER_AVATAR = 40

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 24,
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  headerAvatar: {
    width: HEADER_AVATAR,
    height: HEADER_AVATAR,
    borderRadius: HEADER_AVATAR / 2,
    backgroundColor: '#E5E7EB',
  },
  headerAvatarPlaceholder: {
    width: HEADER_AVATAR,
    height: HEADER_AVATAR,
    borderRadius: HEADER_AVATAR / 2,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInitials: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  signOutButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
  listContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
  },
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  clubAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  clubInfo: {
    flex: 1,
  },
  clubName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  emptyActions: {
    width: '100%',
    maxWidth: 320,
    gap: 12,
  },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4A90D9',
  },
  pressedOpacity: {
    opacity: 0.6,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    flexDirection: 'row',
    gap: 10,
  },
  fabButton: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fabButtonSecondary: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  fabTextSecondary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4A90D9',
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
