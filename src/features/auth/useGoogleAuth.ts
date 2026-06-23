import * as Google from 'expo-auth-session/providers/google'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// OAuth 리디렉트 완료 처리 — 웹에서 인앱 브라우저 세션을 정상 종료하기 위해
// 컴포넌트 마운트 여부와 무관하게 모듈 로드 시점에 한 번 실행해야 한다.
WebBrowser.maybeCompleteAuthSession()

interface UseGoogleAuthReturn {
  signInWithGoogle: () => Promise<void>
  loading: boolean
  error: string | null
}

export function useGoogleAuth(): UseGoogleAuthReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // useIdTokenAuthRequest: id_token을 params에 직접 담아 반환하는 전용 훅.
  // Expo Go / 개발 빌드에서는 clientId(웹용 OAuth Client ID)를 사용하고,
  // 네이티브 바이너리에서는 iosClientId / androidClientId가 우선된다.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_EXPO ?? '',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '',
  })

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error') {
        console.error('[useGoogleAuth] OAuth error:', response.error)
        setError('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.')
      }
      if (response?.type === 'dismiss' || response?.type === 'cancel') {
        setLoading(false)
      }
      return
    }

    const idToken = response.params?.id_token ?? response.authentication?.idToken

    if (!idToken) {
      console.error('[useGoogleAuth] id_token not found in response:', response)
      setError('인증 정보를 가져오지 못했습니다. 다시 시도해 주세요.')
      setLoading(false)
      return
    }

    supabase.auth
      .signInWithIdToken({ provider: 'google', token: idToken })
      .then(({ error: supabaseError }) => {
        if (supabaseError) {
          console.error('[useGoogleAuth] signInWithIdToken error:', supabaseError)
          setError('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.')
        }
      })
      .finally(() => {
        setLoading(false)
      })
  }, [response])

  const signInWithGoogle = async () => {
    setError(null)
    setLoading(true)
    await promptAsync()
    // promptAsync가 resolve된 뒤에는 위 useEffect가 response를 처리하므로
    // 여기서 setLoading(false)를 직접 호출하지 않는다.
  }

  return {
    signInWithGoogle,
    // request가 준비되기 전에는 버튼을 누를 수 없도록 loading으로 합산
    loading: loading || !request,
    error,
  }
}
