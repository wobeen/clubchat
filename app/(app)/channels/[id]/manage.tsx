import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../../src/lib/supabase'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; token: string }

export default function ManageChannelScreen() {
  const { id, channelName } = useLocalSearchParams<{
    id: string
    channelName: string
    clubId: string
  }>()

  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [regenerating, setRegenerating] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (!id) return
      let cancelled = false

      async function load() {
        setState({ status: 'loading' })

        const { data, error } = await supabase.rpc('get_channel_invite', {
          p_channel_id: id,
        })

        if (cancelled) return

        if (error) {
          console.error('[ManageChannel] get_channel_invite error:', error)
          setState({ status: 'error', message: '초대 코드를 불러오지 못했습니다.' })
          return
        }

        const result = data as { success?: boolean; token?: string; error?: string } | null

        if (!result || result.error || !result.token) {
          console.error('[ManageChannel] unexpected response:', result)
          setState({ status: 'error', message: '초대 코드를 불러오지 못했습니다.' })
          return
        }

        setState({ status: 'ready', token: result.token })
      }

      load()

      return () => {
        cancelled = true
      }
    }, [id])
  )

  async function handleCopy(token: string) {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(token)
        Alert.alert('복사 완료', '초대 코드가 클립보드에 복사되었습니다.')
      } catch {
        Alert.alert('복사 실패', '수동으로 코드를 선택하여 복사해 주세요.')
      }
    } else {
      // React Native: Clipboard API는 @react-native-clipboard/clipboard 패키지가 필요.
      // 설치 전이므로 텍스트가 selectable이라 사용자가 직접 길게 눌러 복사할 수 있음을 안내.
      Alert.alert('복사', '코드를 길게 눌러 선택한 뒤 복사해 주세요.')
    }
  }

  function confirmRegenerate() {
    Alert.alert(
      '새 코드 발급',
      '기존 초대 코드가 즉시 만료됩니다. 계속할까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '발급', style: 'destructive', onPress: handleRegenerate },
      ]
    )
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const { data, error } = await supabase.rpc('regenerate_channel_invite', {
        p_channel_id: id,
      })

      if (error) {
        console.error('[ManageChannel] regenerate_channel_invite error:', error)
        Alert.alert('오류', '코드 재생성 중 오류가 발생했습니다.')
        return
      }

      const result = data as { success?: boolean; token?: string; error?: string } | null

      if (!result || result.error || !result.token) {
        console.error('[ManageChannel] unexpected regenerate response:', result)
        Alert.alert('오류', '코드 재생성 중 오류가 발생했습니다.')
        return
      }

      setState({ status: 'ready', token: result.token })
    } finally {
      setRegenerating(false)
    }
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
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressedOpacity]}
          onPress={() => setState({ status: 'loading' })}
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
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {channelName ? (
        <Text style={styles.sectionLabel}>
          <Text style={styles.channelNameHighlight}>{channelName}</Text>
          {' '}초대 코드
        </Text>
      ) : (
        <Text style={styles.sectionLabel}>현재 초대 코드</Text>
      )}

      <View style={styles.tokenBox}>
        <Text
          style={styles.tokenText}
          selectable
          accessibilityLabel={`초대 코드 ${token}`}
        >
          {token}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.copyButton, pressed && styles.pressedOpacity]}
        onPress={() => handleCopy(token)}
        accessibilityRole="button"
        accessibilityLabel="초대 코드 복사"
      >
        <Text style={styles.copyButtonText}>복사하기</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable
        style={({ pressed }) => [
          styles.regenerateButton,
          pressed && styles.pressedOpacity,
          regenerating && styles.disabledButton,
        ]}
        onPress={confirmRegenerate}
        disabled={regenerating}
        accessibilityRole="button"
        accessibilityLabel="새 초대 코드 발급"
      >
        {regenerating ? (
          <ActivityIndicator size="small" color="#DC2626" />
        ) : (
          <Text style={styles.regenerateButtonText}>새 코드 발급</Text>
        )}
      </Pressable>

      <Text style={styles.warningText}>기존 코드는 즉시 만료됩니다.</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  channelNameHighlight: {
    color: '#1A1A1A',
    fontWeight: '700',
  },
  tokenBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  tokenText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D4ED8',
    letterSpacing: 2,
    textAlign: 'center',
  },
  copyButton: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 32,
  },
  regenerateButton: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  regenerateButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },
  disabledButton: {
    opacity: 0.5,
  },
  warningText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
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
  pressedOpacity: {
    opacity: 0.6,
  },
})
