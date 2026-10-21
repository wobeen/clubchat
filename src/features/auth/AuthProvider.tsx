import { Session } from '@supabase/supabase-js'
import { createContext, ReactNode, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface AuthContextValue {
  session: Session | null
  loading: boolean
}

// undefined 기본값: Provider 밖에서 useAuth를 쓰면 즉시 알아챌 수 있도록 한다.
export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * getSession()/onAuthStateChange 구독을 앱 전체에서 단 한 번만 수행한다.
 * 예전에는 화면마다 useAuth()를 호출할 때 각자 이 구독을 새로 만들었는데,
 * 여러 화면(패널)이 동시에 마운트되는 미래의 3-pane 셸에서는 낭비가 커진다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 앱 시작 시 저장된 세션 복원
    supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      if (error) {
        console.error('[AuthProvider] getSession error:', error)
      }
      setSession(initialSession)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, updatedSession) => {
      setSession(updatedSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}
