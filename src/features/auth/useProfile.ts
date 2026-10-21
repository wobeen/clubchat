import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/supabase'

export type ProfileRow = Database['public']['Tables']['profiles']['Row']

interface UseProfileReturn {
  profile: ProfileRow | null
  loading: boolean
  refresh: () => void
  update: (patch: Partial<ProfileRow>) => Promise<{ ok: boolean; error?: string }>
}

const PROFILE_COLUMNS = 'id, display_name, avatar_url, avatar_emoji, grade, birth_year, gender, created_at'

/**
 * profiles 테이블에 대한 재사용 가능한 훅.
 * app/(app)/index.tsx가 하던 ad-hoc `.from('profiles').select(...)` 조회와
 * handleSaveProfile의 update 로직을 일반화했다. 이 훅 자체는 index.tsx를 대체하지 않는다
 * (index.tsx는 이번 단계에서 수정하지 않음) — 앞으로 새로 만드는 화면이 쓸 수 있게 준비된 것.
 */
export function useProfile(userId?: string): UseProfileReturn {
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshCounter, setRefreshCounter] = useState(0)

  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), [])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[useProfile] fetch error:', error)
          setProfile(null)
        } else {
          setProfile(data as ProfileRow | null)
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId, refreshCounter])

  const update = useCallback(
    async (patch: Partial<ProfileRow>): Promise<{ ok: boolean; error?: string }> => {
      if (!userId) return { ok: false, error: '로그인이 필요합니다.' }

      const { error } = await supabase
        .from('profiles')
        .update(patch as never)
        .eq('id', userId)

      if (error) {
        console.error('[useProfile] update error:', error)
        return { ok: false, error: '프로필을 변경할 수 없습니다.' }
      }

      setProfile((prev) => (prev ? { ...prev, ...patch } : prev))
      return { ok: true }
    },
    [userId]
  )

  return { profile, loading, refresh, update }
}
