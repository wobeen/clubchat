import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Event, EventResponse, EventWithMyResponse, ResponseCounts, ResponseStatus } from './types'

// ─── 목록 훅 ──────────────────────────────────────────────────────────────────

type EventScope = { channelId: string } | { clubId: string }

interface UseEventsResult {
  events: EventWithMyResponse[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useEvents(scope: EventScope): UseEventsResult {
  const [events, setEvents] = useState<EventWithMyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const scopeField = 'channelId' in scope ? 'channel_id' : 'club_id'
  const scopeId = 'channelId' in scope ? scope.channelId : scope.clubId

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('인증 정보를 가져올 수 없습니다.')

      // 다가오는 일정만 — starts_at 오름차순
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq(scopeField as 'channel_id' | 'club_id', scopeId)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })

      if (eventsError) throw eventsError

      const rows: Event[] = eventsData ?? []
      if (rows.length === 0) {
        setEvents([])
        return
      }

      // 내 응답을 한 번에 조회 (N+1 방지)
      const eventIds = rows.map((e) => e.id)
      const { data: responsesData, error: responsesError } = await supabase
        .from('event_responses')
        .select('event_id, status')
        .in('event_id', eventIds)
        .eq('user_id', user.id)

      if (responsesError) throw responsesError

      const myStatusMap = new Map<string, ResponseStatus>(
        ((responsesData ?? []) as Array<{ event_id: string; status: ResponseStatus }>)
          .map((r) => [r.event_id, r.status])
      )

      setEvents(
        rows.map((e) => ({
          ...e,
          myStatus: myStatusMap.get(e.id) ?? null,
        }))
      )
    } catch (err) {
      console.error('[useEvents] fetch failed:', err)
      setError('일정을 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [scopeField, scopeId])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  return { events, loading, error, refresh: fetchEvents }
}

// ─── 상세 훅 ──────────────────────────────────────────────────────────────────

interface UseEventDetailResult {
  event: Event | null
  responses: EventResponse[]
  myStatus: ResponseStatus | null
  counts: ResponseCounts
  loading: boolean
  error: string | null
  upsertResponse: (status: ResponseStatus) => Promise<void>
  deleteEvent: () => Promise<{ ok: boolean; error?: string }>
  refresh: () => void
}

export function useEventDetail(eventId: string): UseEventDetailResult {
  const [event, setEvent] = useState<Event | null>(null)
  const [responses, setResponses] = useState<EventResponse[]>([])
  const [myStatus, setMyStatus] = useState<ResponseStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('인증 정보를 가져올 수 없습니다.')

      const [eventResult, responsesResult] = await Promise.all([
        supabase.from('events').select('*').eq('id', eventId).single(),
        supabase.from('event_responses').select('*').eq('event_id', eventId),
      ])

      if (eventResult.error) throw eventResult.error
      if (responsesResult.error) throw responsesResult.error

      const allResponses: EventResponse[] = (responsesResult.data ?? []) as EventResponse[]
      const mine = allResponses.find((r) => r.user_id === user.id) ?? null

      setEvent(eventResult.data)
      setResponses(allResponses)
      setMyStatus(mine?.status ?? null)
    } catch (err) {
      console.error('[useEventDetail] fetch failed:', err)
      setError('일정 정보를 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  // 참석 응답 upsert — RLS가 user_id = auth.uid()를 강제하므로 클라이언트에서 별도 체크 불필요
  const upsertResponse = useCallback(
    async (status: ResponseStatus) => {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('로그인이 필요합니다.')
      }

      const { error: upsertError } = await supabase
        .from('event_responses')
        .upsert(
          { event_id: eventId, user_id: user.id, status, responded_at: new Date().toISOString() },
          { onConflict: 'event_id,user_id' }
        )

      if (upsertError) {
        console.error('[upsertResponse] failed:', upsertError)
        throw new Error('응답을 저장하는 데 실패했습니다.')
      }

      // 낙관적 업데이트
      setMyStatus(status)
      setResponses((prev) => {
        const idx = prev.findIndex((r) => r.user_id === user.id)
        const updated: EventResponse = {
          id: idx >= 0 ? prev[idx].id : crypto.randomUUID(),
          event_id: eventId,
          user_id: user.id,
          status,
          responded_at: new Date().toISOString(),
        }
        return idx >= 0
          ? prev.map((r, i) => (i === idx ? updated : r))
          : [...prev, updated]
      })
    },
    [eventId]
  )

  const deleteEvent = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (deleteError) {
      console.error('[deleteEvent] failed:', deleteError)
      return { ok: false, error: '일정을 삭제하는 데 실패했습니다.' }
    }
    return { ok: true }
  }, [eventId])

  const counts: ResponseCounts = {
    going: responses.filter((r) => r.status === 'going').length,
    not_going: responses.filter((r) => r.status === 'not_going').length,
    maybe: responses.filter((r) => r.status === 'maybe').length,
  }

  return { event, responses, myStatus, counts, loading, error, upsertResponse, deleteEvent, refresh: fetchDetail }
}

// ─── 저장(생성/수정) 훅 ──────────────────────────────────────────────────────

interface EventPayload {
  channel_id?: string | null
  club_id?: string | null
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
}

interface UseSaveEventResult {
  saving: boolean
  saveEvent: (payload: EventPayload, eventId?: string) => Promise<{ ok: boolean; id?: string; error?: string }>
}

export function useSaveEvent(): UseSaveEventResult {
  const [saving, setSaving] = useState(false)

  const saveEvent = useCallback(
    async (payload: EventPayload, eventId?: string): Promise<{ ok: boolean; id?: string; error?: string }> => {
      setSaving(true)
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) return { ok: false, error: '로그인이 필요합니다.' }

        if (eventId) {
          // 수정 — 스코프(channel_id/club_id)는 변경하지 않음, RLS가 작성자만 허용
          const { channel_id, club_id, ...updateFields } = payload
          const { error: updateError } = await supabase
            .from('events')
            .update({ ...updateFields, updated_at: new Date().toISOString() })
            .eq('id', eventId)

          if (updateError) {
            console.error('[saveEvent] update failed:', updateError)
            return { ok: false, error: '일정을 수정하는 데 실패했습니다.' }
          }
          return { ok: true, id: eventId }
        } else {
          // 생성 — created_by는 RLS로 auth.uid() 강제; 클라이언트에서도 명시
          const { data, error: insertError } = await supabase
            .from('events')
            .insert({ ...payload, created_by: user.id })
            .select('id')
            .single()

          if (insertError) {
            console.error('[saveEvent] insert failed:', insertError)
            return { ok: false, error: '일정을 생성하는 데 실패했습니다.' }
          }
          return { ok: true, id: data.id }
        }
      } finally {
        setSaving(false)
      }
    },
    []
  )

  return { saving, saveEvent }
}
