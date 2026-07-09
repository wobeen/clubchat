import * as QueryParams from 'expo-auth-session/build/QueryParams'
import * as WebBrowser from 'expo-web-browser'
import { useState } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../../lib/supabase'

// 네이티브에서 인증 브라우저 세션이 남아있으면 다음 로그인 시도가 멈출 수 있어
// 앱 시작 시 한 번 정리해준다.
WebBrowser.maybeCompleteAuthSession()

interface UseGoogleAuthReturn {
  signInWithGoogle: () => Promise<void>
  loading: boolean
  error: string | null
}

// 네이티브(앱 스킴으로 돌아온) 리디렉션 URL에서 세션을 만든다.
// Supabase 기본 flowType은 implicit이라 URL에 access_token/refresh_token이 담겨온다.
async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url)
  if (errorCode) throw new Error(errorCode)

  const { access_token, refresh_token } = params
  if (!access_token || !refresh_token) return

  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })
  if (error) throw error
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

      if (Platform.OS === 'web') {
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        })
        if (oauthError) throw oauthError
        // 웹에서는 signInWithOAuth가 페이지를 Google로 리디렉션하므로
        // 이 이후 코드는 실행되지 않는다. loading은 리디렉션이 일어나면 자연 소멸.
        return
      }

      // 네이티브: 브라우저를 직접 열고, 돌아온 URL에서 세션을 수동으로 생성해야 한다.
      // (signInWithOAuth만 호출하면 브라우저가 열리지 않아 무한 로딩에 빠진다.)
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (oauthError) throw oauthError
      if (!data?.url) throw new Error('로그인 URL을 받지 못했습니다.')

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

      if (result.type === 'success' && result.url) {
        await createSessionFromUrl(result.url)
      }
      // 사용자가 취소(result.type === 'cancel'/'dismiss')한 경우는 에러 없이 종료.
      setLoading(false)
    } catch (e) {
      console.error('[useGoogleAuth] error:', e)
      setError('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.')
      setLoading(false)
    }
  }

  return { signInWithGoogle, loading, error }
}
