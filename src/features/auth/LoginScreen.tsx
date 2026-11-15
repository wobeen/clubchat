import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Pressable } from '../ui/Pressable'
import { GlassSurface } from '../ui/Glass'
import { fontStyle } from '../ui/fonts'
import { colors, radius } from '../ui/theme'
import { useGoogleAuth } from './useGoogleAuth'

export function LoginScreen() {
  const { signInWithGoogle, loading, error } = useGoogleAuth()

  return (
    <View style={styles.container}>
      <GlassSurface tone="text" radius={radius.panel} style={styles.card}>
        <View style={styles.logo}>
          <Text style={styles.logoLetter}>C</Text>
        </View>
        <Text style={styles.appName}>ClubChat</Text>
        <Text style={styles.tagline}>동아리와 스터디를 한곳에서</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.googleButton, (loading || pressed) && styles.googleButtonPressed]}
          onPress={signInWithGoogle}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Google로 로그인"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator color={colors.ink} size="small" />
          ) : (
            <>
              <View style={styles.gMark}>
                <Text style={styles.gMarkText}>G</Text>
              </View>
              <Text style={styles.googleButtonText}>Google로 계속</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.fine}>학교 계정으로 로그인합니다. 비밀번호는 저장하지 않습니다.</Text>
      </GlassSurface>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoLetter: { color: colors.paper, fontSize: 18, ...fontStyle('700') },
  appName: {
    fontSize: 28,
    ...fontStyle('700'),
    color: colors.ink,
    letterSpacing: -0.6,
  },
  tagline: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 14,
    color: colors.textSecondary,
    ...fontStyle('400'),
  },
  googleButton: {
    width: '100%',
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.14)',
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  googleButtonPressed: { opacity: 0.7 },
  gMark: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gMarkText: { color: colors.paper, fontSize: 11, ...fontStyle('700') },
  googleButtonText: { fontSize: 15, ...fontStyle('600'), color: colors.ink },
  fine: {
    marginTop: 14,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    ...fontStyle('400'),
  },
  errorText: {
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 12,
    ...fontStyle('400'),
  },
})
