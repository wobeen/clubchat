import { Session, User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface UseAuthReturn {
  session: Session | null
  user: User | null
  loading: boolean
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 앱 시작 시 저장된 세션 복원
    supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      if (error) {
        console.error('[useAuth] getSession error:', error)
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

  return {
    session,
    user: session?.user ?? null,
    loading,
  }
}
