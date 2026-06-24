import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { supabase } from '../../../../src/lib/supabase'

interface CreateInviteSuccess {
  success: true
  token: string
}

interface CreateInviteError {
  success?: false
  error: string
}

type CreateInviteResult = CreateInviteSuccess | CreateInviteError

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; token: string }

export default function InviteScreen() {
  const { id, channelName, clubId } = useLocalSearchParams<{ id: string; channelName: string; clubId: string }>()
  const router = useRouter()
  const navigation = useNavigation()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [copied, setCopied] = useState(false)

  function goToClub() {
    if (clubId) {
      router.replace({ pathname: '/(app)/clubs/[id]', params: { id: clubId } })
    } else {
      router.replace('/(app)/')
    }
  }

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={goToClub}
          style={{ paddingHorizontal: 8 }}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          <Text style={{ fontSize: 16, color: '#4A90D9' }}>뒤로</Text>
        </Pressable>
      ),
    })
  // navigation ref는 stable하므로 goToClub 의존성만 필요
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  async function fetchToken() {
    setState({ status: 'loading' })

    const { data, error } = await supabase.rpc('create_invite', {
      p_channel_id: id,
    })

    if (error) {
      console.error('[Invite] rpc error:', error)
      setState({ status: 'error', message: '초대 코드 생성 중 오류가 발생했습니다.' })
      return
    }

    const result = data as unknown as CreateInviteResult

    if (!result || ('error' in result && result.error)) {
      const msg = 'error' in result ? result.error : '알 수 없는 오류'
      console.error('[Invite] result error:', msg)
      setState({ status: 'error', message: '초대 코드 생성에 실패했습니다.' })
      return
    }

    if ('success' in result && result.success) {
      setState({ status: 'ready', token: result.token })
    } else {
      setState({ status: 'error', message: '초대 코드 생성에 실패했습니다.' })
    }
  }

  useEffect(() => {
    if (id) {
      fetchToken()
    }
    // fetchToken reference intentionally omitted — only runs on mount with id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function handleCopy(token: string) {
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(token).catch((e) => {
        console.warn('[Invite] clipboard write failed:', e)
      })
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
        <Text style={styles.loadingText}>초대 코드를 생성하는 중...</Text>
      </View>
    )
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={fetchToken}
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  const { token } = state

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>IN</Text>
        </View>
        <Text style={styles.cardTitle}>
          {channelName ?? '방'} 초대 코드
        </Text>
        <Text style={styles.cardSubtitle}>
          이 코드를 공유하면 멤버가 '방 입장' 화면에서 입력해 참여할 수 있어요.
        </Text>

        <View style={styles.tokenBox}>
          <Text style={styles.tokenText} selectable>{token}</Text>
        </View>

        {Platform.OS === 'web' && (
          <Pressable
            style={({ pressed }) => [styles.copyButton, pressed && styles.pressedOpacity]}
            onPress={() => handleCopy(token)}
            accessibilityRole="button"
            accessibilityLabel="초대 코드 복사"
          >
            <Text style={styles.copyButtonText}>
              {copied ? '복사됐어요!' : '코드 복사'}
            </Text>
          </Pressable>
        )}

        {Platform.OS !== 'web' && (
          <Text style={styles.nativeCopyHint}>
            코드를 길게 눌러 복사하세요
          </Text>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.doneButton, pressed && styles.pressedOpacity]}
        onPress={goToClub}
        accessibilityRole="button"
        accessibilityLabel="완료"
      >
        <Text style={styles.doneButtonText}>완료</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  inner: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 24,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  iconText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  tokenBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 16,
  },
  tokenText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 3,
    textAlign: 'center',
  },
  copyButton: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
    marginTop: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  nativeCopyHint: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  doneButton: {
    height: 52,
    width: '100%',
    maxWidth: 400,
    borderRadius: 14,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pressedOpacity: {
    opacity: 0.6,
  },
})
