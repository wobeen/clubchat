import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { useToast } from '../../src/features/ui/Toast'

interface PreviewSuccess {
  success: true
  channel_id: string
  channel_name: string
  has_password: boolean
  already_member: boolean
}

interface PreviewError {
  success?: false
  error: string
}

type PreviewResult = PreviewSuccess | PreviewError

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; preview: PreviewSuccess }
  | { status: 'joining'; preview: PreviewSuccess }

function mapPreviewError(code: string): string {
  switch (code) {
    case 'invalid_token':
      return '유효하지 않은 초대 링크입니다.'
    case 'token_expired':
      return '만료된 초대 링크입니다.'
    case 'token_exhausted':
      return '더 이상 사용할 수 없는 초대 링크입니다.'
    default:
      return '초대 링크를 확인할 수 없습니다.'
  }
}

export default function JoinByLinkScreen() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const router = useRouter()
  const { show: showToast, ToastComponent } = useToast()

  const [state, setState] = useState<PageState>({ status: 'loading' })

  async function fetchPreview() {
    if (!token) {
      setState({ status: 'error', message: '유효하지 않은 초대 링크입니다.' })
      return
    }

    setState({ status: 'loading' })

    const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token })

    if (error) {
      console.error('[JoinByLink] preview rpc error:', error)
      setState({ status: 'error', message: '초대 링크를 확인할 수 없습니다.' })
      return
    }

    const result = data as unknown as PreviewResult

    if (!result || ('error' in result && result.error)) {
      const code = 'error' in result ? result.error : 'unknown'
      setState({ status: 'error', message: mapPreviewError(code) })
      return
    }

    if ('success' in result && result.success) {
      setState({ status: 'ready', preview: result })
    } else {
      setState({ status: 'error', message: '초대 링크를 확인할 수 없습니다.' })
    }
  }

  useEffect(() => {
    fetchPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function goToChannel(channelId: string, channelName: string) {
    router.replace({
      pathname: '/(app)/channels/[id]/home',
      params: { id: channelId, channelName },
    })
  }

  async function handleJoin(preview: PreviewSuccess) {
    if (!token) return
    setState({ status: 'joining', preview })

    const { data, error } = await supabase.rpc('join_channel_by_invite', { p_token: token })

    if (error) {
      console.error('[JoinByLink] join rpc error:', error)
      showToast('입장 중 오류가 발생했습니다.')
      setState({ status: 'ready', preview })
      return
    }

    const result = data as unknown as { success?: boolean; error?: string }

    if (!result?.success) {
      showToast('입장에 실패했습니다.')
      setState({ status: 'ready', preview })
      return
    }

    showToast(`${preview.channel_name}에 입장했습니다 ✓`)
    goToChannel(preview.channel_id, preview.channel_name)
  }

  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B7DD8" />
      </View>
    )
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedOpacity]}
          onPress={() => router.replace('/(app)/')}
          accessibilityRole="button"
          accessibilityLabel="마이 페이지로"
        >
          <Text style={styles.secondaryButtonText}>마이 페이지로</Text>
        </Pressable>
      </View>
    )
  }

  const { preview } = state
  const joining = state.status === 'joining'

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <ToastComponent />
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>💬</Text>
        </View>
        <Text style={styles.cardTitle}>{preview.channel_name}</Text>

        {preview.already_member ? (
          <>
            <Text style={styles.cardSubtitle}>이미 참여 중인 방이에요.</Text>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedOpacity]}
              onPress={() => goToChannel(preview.channel_id, preview.channel_name)}
              accessibilityRole="button"
              accessibilityLabel="방으로 이동"
            >
              <Text style={styles.primaryButtonText}>방으로 이동</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.cardSubtitle}>이 방에 초대되었습니다. 입장하시겠어요?</Text>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || joining) && styles.pressedOpacity,
              ]}
              onPress={() => handleJoin(preview)}
              disabled={joining}
              accessibilityRole="button"
              accessibilityLabel="입장하기"
            >
              {joining
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.primaryButtonText}>입장하기</Text>}
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  inner: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, alignItems: 'center' },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F7F8FA', paddingHorizontal: 24, gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28,
    width: '100%', maxWidth: 400, alignItems: 'center',
    shadowColor: 'rgba(25,31,40,1)', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#E7EFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  iconText: { fontSize: 26 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#191F28', marginBottom: 8, textAlign: 'center' },
  cardSubtitle: { fontSize: 14, color: '#4E5968', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  primaryButton: {
    height: 50, width: '100%', borderRadius: 12, backgroundColor: '#3B7DD8',
    alignItems: 'center', justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  secondaryButton: {
    height: 50, paddingHorizontal: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#3B7DD8', alignItems: 'center', justifyContent: 'center',
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '700', color: '#3B7DD8' },
  errorText: { fontSize: 15, color: '#E5484D', textAlign: 'center' },
  pressedOpacity: { opacity: 0.7 },
})
