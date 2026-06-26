import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Page, PageScope } from './types'

// ─── 홈페이지 조회 훅 ─────────────────────────────────────────────────────────

interface UsePageResult {
  page: Page | null       // null = 아직 생성되지 않은 빈 페이지
  loading: boolean
  error: string | null
  refresh: () => void
}

export function usePage(scope: PageScope): UsePageResult {
  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async () => {
    const roomId = scope.type === 'room' ? scope.roomId : undefined
    if (!scope.clubId || (scope.type === 'room' && !roomId)) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('pages')
        .select('*')
        .eq('club_id', scope.clubId)
        .eq('is_home', true)

      if (scope.type === 'room') {
        query = query.eq('room_id', scope.roomId)
      } else {
        query = query.is('room_id', null)
      }

      const { data, error: fetchError } = await query.maybeSingle()

      if (fetchError) throw fetchError
      setPage(data ?? null)
    } catch (err) {
      console.error('[usePage] fetch failed:', err)
      setError('페이지를 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [scope.type, scope.clubId, (scope as { roomId?: string }).roomId])

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  return { page, loading, error, refresh: fetchPage }
}

// ─── 홈페이지 저장(생성/수정) 훅 ─────────────────────────────────────────────

interface SavePagePayload {
  title?: string
  content: string
}

interface SavePageResult {
  // existingUpdatedAt: 충돌 감지용 — 수정 시 현재 DB의 updated_at과 비교
  ok: boolean
  conflict?: boolean   // true면 다른 사람이 먼저 수정함
  error?: string
}

interface UseUpsertPageResult {
  saving: boolean
  savePage: (
    scope: PageScope,
    payload: SavePagePayload,
    existingPage: Page | null
  ) => Promise<SavePageResult>
}

export function useUpsertPage(): UseUpsertPageResult {
  const [saving, setSaving] = useState(false)

  const savePage = useCallback(
    async (
      scope: PageScope,
      payload: SavePagePayload,
      existingPage: Page | null
    ): Promise<SavePageResult> => {
      setSaving(true)
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) return { ok: false, error: '로그인이 필요합니다.' }

        if (existingPage) {
          // 낙관적 충돌 감지: DB의 updated_at이 내가 읽은 시점과 다르면 충돌
          const { data: current, error: checkError } = await supabase
            .from('pages')
            .select('updated_at')
            .eq('id', existingPage.id)
            .single()

          if (checkError) throw checkError

          if (current.updated_at !== existingPage.updated_at) {
            return { ok: false, conflict: true }
          }

          const { error: updateError } = await supabase
            .from('pages')
            .update({ ...payload, updated_by: user.id })
            .eq('id', existingPage.id)

          if (updateError) {
            console.error('[savePage] update failed:', updateError)
            return { ok: false, error: '저장에 실패했습니다.' }
          }
        } else {
          // 새 페이지 생성
          const { error: insertError } = await supabase
            .from('pages')
            .insert({
              club_id: scope.clubId,
              room_id: scope.type === 'room' ? scope.roomId : null,
              is_home: true,
              created_by: user.id,
              updated_by: user.id,
              ...payload,
            })

          if (insertError) {
            console.error('[savePage] insert failed:', insertError)
            return { ok: false, error: '페이지를 만드는 데 실패했습니다.' }
          }
        }

        return { ok: true }
      } catch (err) {
        console.error('[savePage] unexpected error:', err)
        return { ok: false, error: '알 수 없는 오류가 발생했습니다.' }
      } finally {
        setSaving(false)
      }
    },
    []
  )

  return { saving, savePage }
}
