import { useState } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../../lib/supabase'

interface UseGoogleAuthReturn {
  signInWithGoogle: () => Promise<void>
  loading: boolean
  error: string | null
}

export function useGoogleAuth(): UseGoogleAuthReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signInWithGoogle = async () => {
    setError(null)
    setLoading(true)
    try {
      // redirectTo는 Supabase 서버가 처리한 뒤 앱으로 돌아올 주소.
      // Google 콘솔에 등록하는 URI는 Supabase 콜백(*.supabase.co/auth/v1/callback)이므로
      // 포트나 도메인이 바뀌어도 Google 콘솔 설정은 변경 불필요.
      const redirectTo =
        Platform.OS === 'web' ? window.location.origin : 'clubchat://'

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })

      if (oauthError) {
        console.error('[useGoogleAuth] signInWithOAuth error:', oauthError)
        setError('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.')
        setLoading(false)
      }
      // 웹에서는 signInWithOAuth가 페이지를 Google로 리디렉션하므로
      // 이 이후 코드는 실행되지 않는다. loading은 리디렉션이 일어나면 자연 소멸.
    } catch (e) {
      console.error('[useGoogleAuth] unexpected error:', e)
      setError('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.')
      setLoading(false)
    }
  }

  return { signInWithGoogle, loading, error }
}
