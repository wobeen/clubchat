import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router'
import * as Linking from 'expo-linking'
import { useEffect } from 'react'
import { AppWallpaper } from '../src/features/ui/AppWallpaper'
import { useAppFonts } from '../src/features/ui/fonts'
import { colors } from '../src/features/ui/theme'
import { AuthProvider } from '../src/features/auth/AuthProvider'
import { useAuth } from '../src/features/auth/useAuth'
import { usePushToken } from '../src/features/notifications/usePushToken'
import { parseInviteToken } from '../src/features/deeplink/parseInviteLink'
import { setPendingDeepLink, consumePendingDeepLink } from '../src/features/deeplink/pendingDeepLink'

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: 'transparent',
    card: 'transparent',
    text: colors.ink,
    border: 'rgba(26,26,26,0.08)',
    notification: colors.accent,
  },
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  )
}

function RootLayoutNav() {
  const { session, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()
  const url = Linking.useURL()
  const fontsReady = useAppFonts()
  const onPreview = __DEV__ && segments[0] === 'preview'

  // 로그인 후 푸시 토큰 등록 (실기기에서만 동작, 웹/시뮬레이터 자동 스킵)
  usePushToken(session?.user?.id)

  // 로그인 안 된 상태로 초대 딥링크를 열면 아래 useEffect가 로그인 화면으로
  // 튕겨내는데, 그 전에 목적지를 기억해뒀다가 로그인 성공 후 되돌아간다.
  useEffect(() => {
    if (!url) return
    const token = parseInviteToken(url)
    if (token) {
      setPendingDeepLink({ pathname: '/(app)/join', params: { token } })
    }
  }, [url])

  useEffect(() => {
    if (loading) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup && !onPreview) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace(consumePendingDeepLink() ?? '/(app)')
    }
  }, [session, loading, segments, onPreview])

  if (loading || !fontsReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return (
    <ThemeProvider value={navTheme}>
      <AppWallpaper>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'none',
          }}
        />
      </AppWallpaper>
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.wallpaper,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
