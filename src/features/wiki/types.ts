export interface Page {
  id: string
  club_id: string
  room_id: string | null  // null이면 동아리 레벨 페이지
  title: string | null
  content: string         // 마크다운 원문
  is_home: boolean
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string      // 낙관적 충돌 체크에 사용
}

// usePage 훅에 넘기는 스코프 식별자
export type PageScope =
  | { type: 'club'; clubId: string }
  | { type: 'room'; clubId: string; roomId: string }
