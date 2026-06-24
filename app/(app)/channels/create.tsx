import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../src/lib/supabase'

interface CreateChannelSuccess {
  success: true
  channel_id: string
  channel_name: string
}

interface CreateChannelError {
  success?: false
  error: string
}

type CreateChannelResult = CreateChannelSuccess | CreateChannelError

type FormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }

function mapRpcError(code: string): string {
  switch (code) {
    case 'not_authorized':
      return '방장만 방을 만들 수 있습니다.'
    case 'invalid_name':
      return '방 이름을 입력해주세요.'
    default:
      return '방 만들기 중 오류가 발생했습니다.'
  }
}

export default function CreateChannelScreen() {
  const { clubId, clubName } = useLocalSearchParams<{ clubId: string; clubName: string }>()
  const router = useRouter()

  const [name, setName] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [form, setForm] = useState<FormState>({ status: 'idle' })

  async function handleCreate() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setForm({ status: 'error', message: '방 이름을 입력해주세요.' })
      return
    }
    if (usePassword && !password.trim()) {
      setForm({ status: 'error', message: '비밀번호를 입력하거나 비밀번호 설정을 해제해주세요.' })
      return
    }

    setForm({ status: 'loading' })

    const { data, error } = await supabase.rpc('create_channel', {
      p_club_id: clubId,
      p_name: trimmedName,
      p_password: usePassword ? password.trim() : null,
    })

    if (error) {
      console.error('[CreateChannel] rpc error:', error)
      setForm({ status: 'error', message: '방 만들기 중 오류가 발생했습니다.' })
      return
    }

    const result = data as unknown as CreateChannelResult

    if (!result || ('error' in result && result.error)) {
      const code = 'error' in result ? result.error : 'unknown'
      console.error('[CreateChannel] result error:', code)
      setForm({ status: 'error', message: mapRpcError(code) })
      return
    }

    if ('success' in result && result.success) {
      router.replace({
        pathname: '/(app)/channels/[id]/invite',
        params: { id: result.channel_id, channelName: result.channel_name, clubId },
      })
    } else {
      setForm({ status: 'error', message: '방 만들기에 실패했습니다.' })
    }
  }

  const isLoading = form.status === 'loading'

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          <Text style={styles.subtitleBold}>{clubName ?? '동아리'}</Text>에 새 방을 만듭니다
        </Text>

        {form.status === 'error' && (
          <Text style={styles.errorText}>{form.message}</Text>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>방 이름</Text>
          <TextInput
            style={styles.input}
            placeholder="방 이름을 입력하세요"
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={(v) => {
              setName(v)
              if (form.status === 'error') setForm({ status: 'idle' })
            }}
            maxLength={30}
            autoFocus
            returnKeyType="next"
            editable={!isLoading}
            accessibilityLabel="방 이름 입력"
          />
          <Text style={styles.charCount}>{name.length}/30</Text>
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelGroup}>
            <Text style={styles.toggleLabel}>비밀번호 설정</Text>
            <Text style={styles.toggleSub}>켜면 비밀번호를 알아야 입장할 수 있어요</Text>
          </View>
          <Switch
            value={usePassword}
            onValueChange={(v) => {
              setUsePassword(v)
              if (!v) setPassword('')
              if (form.status === 'error') setForm({ status: 'idle' })
            }}
            trackColor={{ false: '#E5E7EB', true: '#93C5FD' }}
            thumbColor={usePassword ? '#4A90D9' : '#FFFFFF'}
            disabled={isLoading}
            accessibilityLabel="비밀번호 설정 토글"
          />
        </View>

        {usePassword && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>비밀번호</Text>
            <TextInput
              style={styles.input}
              placeholder="비밀번호를 입력하세요"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={(v) => {
                setPassword(v)
                if (form.status === 'error') setForm({ status: 'idle' })
              }}
              secureTextEntry
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              editable={!isLoading}
              accessibilityLabel="방 비밀번호 입력"
            />
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.createButton,
            (pressed || isLoading) && styles.pressedOpacity,
          ]}
          onPress={handleCreate}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="방 만들기"
          accessibilityState={{ disabled: isLoading }}
        >
          {isLoading
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.createButtonText}>만들기</Text>
          }
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  inner: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 28,
    lineHeight: 22,
  },
  subtitleBold: {
    fontWeight: '700',
    color: '#1A1A1A',
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A1A1A',
  },
  charCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  toggleLabelGroup: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  toggleSub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  createButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    marginBottom: 16,
    textAlign: 'center',
  },
  pressedOpacity: {
    opacity: 0.6,
  },
})
