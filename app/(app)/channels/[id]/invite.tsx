import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import QRCode from 'react-native-qrcode-svg'
import * as Clipboard from 'expo-clipboard'
import { supabase } from '../../../../src/lib/supabase'
import { buildInviteLink } from '../../../../src/features/deeplink/parseInviteLink'

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

  async function handleCopyLink(link: string) {
    if (Platform.OS === 'web') {
      await navigator.clipboard?.writeText(link).catch((e) => {
        console.warn('[Invite] clipboard write failed:', e)
      })
    } else {
      await Clipboard.setStringAsync(link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleShareLink(link: string) {
    try {
      await Share.share({ message: `${channelName ?? '방'} 초대 링크\n${link}` })
    } catch (e) {
      console.warn('[Invite] share failed:', e)
    }
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
  const inviteLink = buildInviteLink(token)

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {channelName ?? '방'} 초대
        </Text>
        <Text style={styles.cardSubtitle}>
          QR코드를 스캔하거나 링크를 공유하면 바로 입장할 수 있어요.
        </Text>

        <View style={styles.qrBox}>
          <QRCode value={inviteLink} size={180} />
        </View>

        <View style={styles.linkRow}>
          <Pressable
            style={({ pressed }) => [styles.copyButton, pressed && styles.pressedOpacity]}
            onPress={() => handleCopyLink(inviteLink)}
            accessibilityRole="button"
            accessibilityLabel="초대 링크 복사"
          >
            <Text style={styles.copyButtonText}>
              {copied ? '복사됐어요!' : '링크 복사'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.shareButton, pressed && styles.pressedOpacity]}
            onPress={() => handleShareLink(inviteLink)}
            accessibilityRole="button"
            accessibilityLabel="초대 링크 공유"
          >
            <Text style={styles.shareButtonText}>공유하기</Text>
          </Pressable>
        </View>

        <View style={styles.tokenBox}>
          <Text style={styles.tokenLabel}>초대 코드 (직접 입력용)</Text>
          <Text style={styles.tokenText} selectable>{token}</Text>
        </View>
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
  qrBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  linkRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 20,
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
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  tokenLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
  },
  tokenText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  copyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#4A90D9',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A90D9',
  },
  shareButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
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
