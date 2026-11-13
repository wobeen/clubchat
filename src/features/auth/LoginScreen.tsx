import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Pressable } from '../ui/Pressable'
import { useGoogleAuth } from './useGoogleAuth'

export function LoginScreen() {
  const { signInWithGoogle, loading, error } = useGoogleAuth()

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        {/* 로고 자리 — 추후 <Image> 교체 */}
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoLetter}>C</Text>
        </View>
        <Text style={styles.appName}>ClubChat</Text>
        <Text style={styles.tagline}>동아리·소모임 업무용 메신저</Text>
      </View>

      <View style={styles.actions}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.googleButton,
            (loading || pressed) && styles.googleButtonDisabled,
          ]}
          onPress={signInWithGoogle}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Google로 로그인"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator color="#444" size="small" />
          ) : (
            <Text style={styles.googleButtonText}>Google로 로그인</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 64,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoLetter: { color: '#FFFFFF', fontSize: 28, fontWeight: '700' },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 15,
    color: '#5A5A5A',
  },
  actions: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
  },
  googleButton: {
    width: '100%',
    height: 52,
    borderWidth: 1.5,
    borderRadius: 999,
    borderColor: 'rgba(26,26,26,0.14)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    // Web에서 hover cursor
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  errorText: {
    fontSize: 14,
    color: '#1A1A1A',
    textAlign: 'center',
  },
})
