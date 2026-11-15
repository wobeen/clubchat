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
import { ScreenOverlay } from '../../../../src/features/shell'
import { GlassSurface } from '../../../../src/features/ui/Glass'
import { Button } from '../../../../src/features/ui/GlassControls'
import { colors, radius } from '../../../../src/features/ui/theme'

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

// Phase 4: 넓은 화면에서는 ScreenOverlay가 이 컴포넌트를 다이얼로그 카드로 감싼다
// (아래 default export 참고). 컴팩트 화면에서는 기존과 동일하게 네이티브 풀스크린
// 라우트로 보인다.
function InviteScreenContent() {
  const { id, channelName, clubId } = useLocalSearchParams<{ id: string; channelName: string; clubId: string }>()
  const router = useRouter()
  const navigation = useNavigation()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [copied, setCopied] = useState(false)

  function goToClub() {
    if (clubId) {
      router.replace({ pathname: '/(app)/clubs/[id]', params: { id: clubId } })
    } else {
      router.replace('/(app)')
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
          <Text style={{ fontSize: 16, color: '#0863BF' }}>뒤로</Text>
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
        <ActivityIndicator size="large" color="#0863BF" />
        <Text style={styles.loadingText}>초대 코드를 생성하는 중...</Text>
      </View>
    )
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Button label="다시 시도" onPress={fetchToken} style={styles.retryButton} />
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
      <GlassSurface tone="text" radius={radius.panel} style={styles.card}>
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
          <Button
            label={copied ? '복사됐어요!' : '링크 복사'}
            variant="secondary"
            onPress={() => handleCopyLink(inviteLink)}
            style={styles.pairBtn}
          />
          <Button label="공유" onPress={() => handleShareLink(inviteLink)} style={styles.pairBtn} />
        </View>

        <View style={styles.tokenBox}>
          <Text style={styles.tokenLabel}>초대 코드 (직접 입력용)</Text>
          <Text style={styles.tokenText} selectable>{token}</Text>
        </View>
      </GlassSurface>

      <Button label="완료" onPress={goToClub} style={styles.doneButton} />
    </ScrollView>
  )
}

export default function InviteScreen() {
  const { channelName } = useLocalSearchParams<{ channelName: string }>()
  const router = useRouter()

  return (
    <ScreenOverlay title={`${channelName ?? '방'} 초대`} onClose={() => router.back()}>
      <InviteScreenContent />
    </ScreenOverlay>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#5A5A5A',
    marginTop: 8,
  },
  card: {
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    marginBottom: 24,
  },
  pairBtn: { flex: 1, minHeight: 44 },
  qrBox: {
    backgroundColor: colors.paper,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
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
    color: '#5A5A5A',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  tokenBox: {
    backgroundColor: colors.glassNested,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  tokenLabel: {
    fontSize: 11,
    color: '#5A5A5A',
    marginBottom: 4,
  },
  tokenText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0863BF',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  doneButton: {
    height: 44,
    width: '100%',
    maxWidth: 400,
  },
  errorText: {
    fontSize: 15,
    color: '#1A1A1A',
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: 24,
  },
})
