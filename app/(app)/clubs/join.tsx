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

interface JoinClubSuccess {
  success: true
  club_id: string
  club_name: string
}

interface JoinClubError {
  success?: false
  error: string
}

type JoinClubResult = JoinClubSuccess | JoinClubError

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: '유효하지 않은 코드입니다.',
  already_member: '이미 가입된 동아리입니다.',
}

type FormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'joined'; clubName: string }

export default function JoinClubScreen() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [form, setForm] = useState<FormState>({ status: 'idle' })

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setForm({ status: 'error', message: '초대 코드를 입력해주세요.' })
      return
    }

    setForm({ status: 'loading' })

    const { data, error } = await supabase.rpc('join_club_by_invite_code', { p_code: trimmed })

    if (error) {
      console.error('[JoinClub] rpc error:', error)
      setForm({ status: 'error', message: '가입 중 오류가 발생했습니다.' })
      return
    }

    const result = data as unknown as JoinClubResult

    if (!result || ('error' in result && result.error)) {
      const errorKey = 'error' in result ? result.error : 'unknown'
      const msg = ERROR_MESSAGES[errorKey] ?? '가입에 실패했습니다.'
      console.error('[JoinClub] result error:', errorKey)
      setForm({ status: 'error', message: msg })
      return
    }

    if ('success' in result && result.success) {
      setForm({ status: 'joined', clubName: result.club_name })
      setTimeout(() => router.back(), 1800)
    } else {
      setForm({ status: 'error', message: '가입에 실패했습니다.' })
    }
  }

  if (form.status === 'joined') {
    return (
      <View style={styles.centered}>
        <View style={styles.joinedIcon}>
          <Text style={styles.joinedIconText}>OK</Text>
        </View>
        <Text style={styles.joinedTitle}>{form.clubName} 동아리에{'\n'}가입했어요!</Text>
        <ActivityIndicator size="small" color="#4A90D9" style={{ marginTop: 24 }} />
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
        <Text style={styles.title}>동아리 가입</Text>
        <Text style={styles.subtitle}>동아리 관리자에게 받은 8자리 초대 코드를 입력하세요.</Text>

        {form.status === 'error' && (
          <Text style={styles.errorText}>{form.message}</Text>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>초대 코드</Text>
          <TextInput
            style={styles.input}
            placeholder="8자리 초대 코드"
            placeholderTextColor="#9CA3AF"
            value={code}
            onChangeText={(v) => {
              setCode(v.toUpperCase())
              if (form.status === 'error') setForm({ status: 'idle' })
            }}
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleJoin}
            editable={!isLoading}
            accessibilityLabel="초대 코드 입력"
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.joinButton,
            (pressed || isLoading) && styles.pressedOpacity,
          ]}
          onPress={handleJoin}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="가입하기"
          accessibilityState={{ disabled: isLoading }}
        >
          {isLoading
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.joinButtonText}>가입하기</Text>
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
  centered: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
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
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 4,
    textAlign: 'center',
  },
  joinButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  joinButtonText: {
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
  joinedIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  joinedIconText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  joinedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 32,
  },
})
