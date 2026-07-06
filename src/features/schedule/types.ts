// DB 계약(CLAUDE.md §3)에서 가져온 인터페이스.
// Supabase 타입이 생성되면 이 파일을 대체한다.

export interface Event {
  id: string
  channel_id: string | null
  club_id: string | null
  title: string
  description: string | null
  starts_at: string // ISO 8601 timestamptz
  ends_at: string | null
  location: string | null
  created_by: string // profiles.id
  created_at: string
  updated_at: string
}

export type ResponseStatus = 'going' | 'not_going' | 'maybe'

export interface EventResponse {
  id: string
  event_id: string
  user_id: string
  status: ResponseStatus
  responded_at: string
}

// 집계용 — 서버에서 count() 쿼리로 받거나 클라이언트에서 계산
export interface ResponseCounts {
  going: number
  not_going: number
  maybe: number
}

// useEvents 훅이 반환하는 이벤트 + 내 응답 상태를 합친 형태
export interface EventWithMyResponse extends Event {
  myStatus: ResponseStatus | null
}
