import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../../src/lib/supabase'

interface JoinChannelSuccess {
  success: true
}

interface JoinChannelError {
  success?: false
  error: string
}

type JoinChannelResult = JoinChannelSuccess | JoinChannelError

type InviteFormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }

type PasswordFormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }

function mapInviteError(code: string): string {
  switch (code) {
    case 'invalid_token':
      return '유효하지 않은 코드입니다.'
    case 'token_expired':
      return '만료된 코드입니다.'
    case 'token_exhausted':
      return '더 이상 사용할 수 없는 코드입니다.'
    case 'already_member':
      return '이미 참여한 방입니다.'
    default:
      return '입장 중 오류가 발생했습니다.'
  }
}

function mapPasswordError(code: string): string {
  switch (code) {
    case 'wrong_password':
      return '비밀번호가 맞지 않습니다.'
    case 'no_password_set':
      return '비밀번호가 설정되지 않은 방입니다.'
    case 'already_member':
      return '이미 참여한 방입니다.'
    default:
      return '입장 중 오류가 발생했습니다.'
  }
}

export default function JoinChannelScreen() {
  const { id, hasPassword, channelName } = useLocalSearchParams<{
    id: string
    hasPassword: string
    channelName: string
  }>()
  const router = useRouter()
  const isPasswordChannel = hasPassword === '1'

  const [inviteToken, setInviteToken] = useState('')
  const [inviteForm, setInviteForm] = useState<InviteFormState>({ status: 'idle' })

  const [channelPassword, setChannelPassword] = useState('')
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({ status: 'idle' })

  async function handleJoinByInvite() {
    const trimmed = inviteToken.trim()
    if (!trimmed) {
      setInviteForm({ status: 'error', message: '초대 코드를 입력해주세요.' })
      return
    }

    setInviteForm({ status: 'loading' })

    const { data, error } = await supabase.rpc('join_channel_by_invite', {
      p_token: trimmed,
    })

    if (error) {
      console.error('[JoinChannel] invite rpc error:', error)
      setInviteForm({ status: 'error', message: '입장 중 오류가 발생했습니다.' })
      return
    }

    const result = data as unknown as JoinChannelResult

    if (!result || ('error' in result && result.error)) {
      const code = 'error' in result ? result.error : 'unknown'
      console.error('[JoinChannel] invite result error:', code)
      setInviteForm({ status: 'error', message: mapInviteError(code) })
      return
    }

    if ('success' in result && result.success) {
      Alert.alert('입장 완료', `${channelName ?? '방'}에 입장했습니다.`, [
        { text: '확인', onPress: () => router.back() },
      ])
    } else {
      setInviteForm({ status: 'error', message: '입장에 실패했습니다.' })
    }
  }

  async function handleJoinByPassword() {
    const trimmed = channelPassword.trim()
    if (!trimmed) {
      setPasswordForm({ status: 'error', message: '비밀번호를 입력해주세요.' })
      return
    }

    setPasswordForm({ status: 'loading' })

    const { data, error } = await supabase.rpc('join_channel_by_password', {
      p_channel_id: id,
      p_password: trimmed,
    })

    if (error) {
      console.error('[JoinChannel] password rpc error:', error)
      setPasswordForm({ status: 'error', message: '입장 중 오류가 발생했습니다.' })
      return
    }

    const result = data as unknown as JoinChannelResult

    if (!result || ('error' in result && result.error)) {
      const code = 'error' in result ? result.error : 'unknown'
      console.error('[JoinChannel] password result error:', code)
      setPasswordForm({ status: 'error', message: mapPasswordError(code) })
      return
    }

    if ('success' in result && result.success) {
      Alert.alert('입장 완료', `${channelName ?? '방'}에 입장했습니다.`, [
        { text: '확인', onPress: () => router.back() },
      ])
    } else {
      setPasswordForm({ status: 'error', message: '입장에 실패했습니다.' })
    }
  }

  const inviteLoading = inviteForm.status === 'loading'
  const passwordLoading = passwordForm.status === 'loading'

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenTitle}>
          <Text style={styles.channelNameBold}>{channelName ?? '방'}</Text>에 입장하기
        </Text>

        {/* 초대 코드로 입장 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>초대 코드로 입장</Text>
          <Text style={styles.sectionSubtitle}>방 멤버에게 초대 코드를 받아 입력하세요</Text>

          {inviteForm.status === 'error' && (
            <Text style={styles.errorText}>{inviteForm.message}</Text>
          )}

          <View style={styles.fieldGroup}>
            <TextInput
              style={styles.input}
              placeholder="초대 코드 입력"
              placeholderTextColor="#9CA3AF"
              value={inviteToken}
              onChangeText={(v) => {
                setInviteToken(v)
                if (inviteForm.status === 'error') setInviteForm({ status: 'idle' })
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={32}
              returnKeyType="done"
              onSubmitEditing={handleJoinByInvite}
              editable={!inviteLoading}
              accessibilityLabel="초대 코드 입력"
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || inviteLoading) && styles.pressedOpacity,
            ]}
            onPress={handleJoinByInvite}
            disabled={inviteLoading}
            accessibilityRole="button"
            accessibilityLabel="초대 코드로 입장하기"
            accessibilityState={{ disabled: inviteLoading }}
          >
            {inviteLoading
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={styles.primaryButtonText}>입장하기</Text>
            }
          </Pressable>
        </View>

        {/* 비밀번호로 입장 — 비밀번호 방일 때만 표시 */}
        {isPasswordChannel && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>또는</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>비밀번호로 입장</Text>
              <Text style={styles.sectionSubtitle}>이 방은 비밀번호가 설정된 방입니다</Text>

              {passwordForm.status === 'error' && (
                <Text style={styles.errorText}>{passwordForm.message}</Text>
              )}

              <View style={styles.fieldGroup}>
                <TextInput
                  style={styles.input}
                  placeholder="비밀번호 입력"
                  placeholderTextColor="#9CA3AF"
                  value={channelPassword}
                  onChangeText={(v) => {
                    setChannelPassword(v)
                    if (passwordForm.status === 'error') setPasswordForm({ status: 'idle' })
                  }}
                  secureTextEntry
                  maxLength={30}
                  returnKeyType="done"
                  onSubmitEditing={handleJoinByPassword}
                  editable={!passwordLoading}
                  accessibilityLabel="방 비밀번호 입력"
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  (pressed || passwordLoading) && styles.pressedOpacity,
                ]}
                onPress={handleJoinByPassword}
                disabled={passwordLoading}
                accessibilityRole="button"
                accessibilityLabel="비밀번호로 입장하기"
                accessibilityState={{ disabled: passwordLoading }}
              >
                {passwordLoading
                  ? <ActivityIndicator color="#4A90D9" size="small" />
                  : <Text style={styles.secondaryButtonText}>비밀번호로 입장</Text>
                }
              </Pressable>
            </View>
          </>
        )}
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
    paddingBottom: 48,
  },
  screenTitle: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 28,
    lineHeight: 26,
  },
  channelNameBold: {
    fontWeight: '700',
    color: '#1A1A1A',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  input: {
    height: 52,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A1A1A',
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4A90D9',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: 12,
    textAlign: 'center',
  },
  pressedOpacity: {
    opacity: 0.6,
  },
})
