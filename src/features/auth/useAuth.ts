import { Session, User } from '@supabase/supabase-js'
import { useContext } from 'react'
import { AuthContext } from './AuthProvider'

interface UseAuthReturn {
  session: Session | null
  user: User | null
  loading: boolean
}

export function useAuth(): UseAuthReturn {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth() must be used within an <AuthProvider> (mounted in app/_layout.tsx)')
  }

  return {
    session: ctx.session,
    user: ctx.session?.user ?? null,
    loading: ctx.loading,
  }
}
