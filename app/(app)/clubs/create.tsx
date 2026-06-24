import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../../src/lib/supabase'

interface CreateClubSuccess {
  success: true
  club_id: string
  club_name: string
  invite_code: string
}

interface CreateClubError {
  success?: false
  error: string
}

type CreateClubResult = CreateClubSuccess | CreateClubError

type FormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'created'; clubName: string; inviteCode: string }

export default function CreateClubScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [form, setForm] = useState<FormState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      setForm({ status: 'error', message: '동아리 이름을 입력해주세요.' })
      return
    }

    setForm({ status: 'loading' })

    const { data, error } = await supabase.rpc('create_club', { p_name: trimmed })

    if (error) {
      console.error('[CreateClub] rpc error:', error)
      setForm({ status: 'error', message: '동아리 생성 중 오류가 발생했습니다.' })
      return
    }

    const result = data as unknown as CreateClubResult

    if (!result || ('error' in result && result.error)) {
      const msg = 'error' in result ? result.error : '알 수 없는 오류'
      console.error('[CreateClub] result error:', msg)
      setForm({ status: 'error', message: msg })
      return
    }

    if ('success' in result && result.success) {
      setForm({
        status: 'created',
        clubName: result.club_name,
        inviteCode: result.invite_code,
      })
    } else {
      setForm({ status: 'error', message: '동아리 생성에 실패했습니다.' })
    }
  }

  function handleCopyCode(code: string) {
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(code).catch((e) => {
        console.warn('[CreateClub] clipboard write failed:', e)
      })
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (form.status === 'created') {
    return (
      <View style={styles.container}>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>OK</Text>
          </View>
          <Text style={styles.successTitle}>동아리가 생성됐어요!</Text>
          <Text style={styles.successClubName}>{form.clubName}</Text>

          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>초대 코드</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText} selectable>{form.inviteCode}</Text>
            </View>
            <Text style={styles.codeHint}>이 코드를 공유하면 멤버가 가입할 수 있어요.</Text>
            {Platform.OS === 'web' && (
              <Pressable
                style={({ pressed }) => [styles.copyButton, pressed && styles.pressedOpacity]}
                onPress={() => handleCopyCode(form.inviteCode)}
                accessibilityRole="button"
                accessibilityLabel="초대 코드 복사"
              >
                <Text style={styles.copyButtonText}>{copied ? '복사됐어요!' : '코드 복사'}</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [styles.doneButton, pressed && styles.pressedOpacity]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="완료"
          >
            <Text style={styles.doneButtonText}>완료</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const isLoading = form.status === 'loading'

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>새 동아리 만들기</Text>
        <Text style={styles.subtitle}>동아리 이름을 입력하면 초대 코드가 자동으로 생성됩니다.</Text>

        {form.status === 'error' && (
          <Text style={styles.errorText}>{form.message}</Text>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>동아리 이름</Text>
          <TextInput
            style={styles.input}
            placeholder="동아리 이름을 입력하세요"
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={(v) => {
              setName(v)
              if (form.status === 'error') setForm({ status: 'idle' })
            }}
            maxLength={50}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            editable={!isLoading}
            accessibilityLabel="동아리 이름 입력"
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.createButton,
            (pressed || isLoading) && styles.pressedOpacity,
          ]}
          onPress={handleCreate}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="동아리 만들기"
          accessibilityState={{ disabled: isLoading }}
        >
          {isLoading
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.createButtonText}>만들기</Text>
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 32,
    lineHeight: 20,
  },
  fieldGroup: {
    marginBottom: 24,
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
  createButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
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
  // 생성 완료 상태
  successCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successIconText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
    textAlign: 'center',
  },
  successClubName: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
    textAlign: 'center',
  },
  codeSection: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    marginBottom: 32,
  },
  codeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  codeText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 4,
  },
  codeHint: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  copyButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  doneButton: {
    height: 52,
    width: '100%',
    maxWidth: 320,
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
})
