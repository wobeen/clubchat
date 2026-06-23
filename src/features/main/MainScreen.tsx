import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/supabase'

type Profile = Database['public']['Tables']['profiles']['Row']

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; profile: Profile }

function getInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

export function MainScreen() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchProfile() {
      setState({ status: 'loading' })

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        console.error('[MainScreen] getUser error:', userError)
        if (!cancelled) setState({ status: 'error', message: '사용자 정보를 불러올 수 없습니다.' })
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', userData.user.id)
        .single()

      if (cancelled) return

      if (error) {
        console.error('[MainScreen] profiles fetch error:', error)
        setState({ status: 'error', message: '프로필을 불러오는 중 오류가 발생했습니다.' })
        return
      }

      if (!data) {
        setState({ status: 'empty' })
        return
      }

      setState({ status: 'ready', profile: data })
    }

    fetchProfile()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      // useAuth의 onAuthStateChange가 세션 소멸을 감지해 LoginScreen으로 전환하므로
      // 로그아웃 자체가 실패한 경우에만 에러를 알린다.
      console.error('[MainScreen] signOut error:', error)
      setState({ status: 'error', message: '로그아웃 중 오류가 발생했습니다.' })
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

  if (state.status === 'empty') {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>프로필 정보가 없습니다.</Text>
      </View>
    )
  }

  const { profile } = state
  const initials = getInitials(profile.display_name)

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* 아바타 */}
        {profile.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={styles.avatar}
            accessibilityLabel={`${profile.display_name}의 프로필 사진`}
          />
        ) : (
          <View style={styles.avatarPlaceholder} accessibilityLabel={`${profile.display_name}의 이니셜 아바타`}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}

        {/* 이름 */}
        <Text style={styles.displayName}>{profile.display_name}</Text>

        {/* 로그아웃 */}
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            (pressed || signingOut) && styles.signOutButtonPressed,
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
          accessibilityState={{ disabled: signingOut }}
          // 웹에서 pointer cursor
          {...(Platform.OS === 'web' ? { style: [styles.signOutButton, { cursor: 'pointer' } as object] } : {})}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Text style={styles.signOutText}>로그아웃</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const AVATAR_SIZE = 96

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#F3F4F6',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
    // 그림자 — iOS/Android/web 각각 처리
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginBottom: 20,
    backgroundColor: '#E5E7EB',
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 32,
    textAlign: 'center',
  },
  signOutButton: {
    height: 48,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  signOutButtonPressed: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
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
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
})
