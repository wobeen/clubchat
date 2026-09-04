// ─── /w 네임스페이스 주소 형태를 아는 유일한 훅 ─────────────────────────────────
// 패널 컴포넌트(IconRail, ClubListPane, RoomListPane 등)는 이 훅을 통해서만
// 네비게이션을 수행하고, 절대 직접 경로 문자열을 만들지 않는다.
//
// 라우트 파일 구조:
//   app/(app)/w/index.tsx                -> /(app)/w                (params 없음)
//   app/(app)/w/[clubId]/index.tsx       -> /(app)/w/[clubId]       (params: clubId)
//   app/(app)/w/[clubId]/[roomId].tsx    -> /(app)/w/[clubId]/[roomId] (params: clubId, roomId, view?)
//
// useLocalSearchParams()는 현재 활성화된 라우트가 정의한 동적 세그먼트를 그대로
// 돌려주므로, 얕은 라우트(w/index)에서는 clubId/roomId가 둘 다 undefined이고
// 깊은 라우트로 갈수록 자연히 채워진다.
//
// view(Phase 2): 방 화면(w/[clubId]/[roomId])의 본문을 "홈"(위키+일정)과
// "채팅" 사이에서 전환하는 쿼리 파라미터. openChat/closeChat은 router.push로
// 같은 라우트에 view만 바꿔 넣는다 — push이므로 스택에 새 엔트리가 쌓이고,
// 그 덕에 컴팩트 모드에서 goUp()(router.back())이 채팅 -> 홈 -> 방 목록 순으로
// 자연스럽게 되돌아간다.

import { useLocalSearchParams, useRouter } from 'expo-router'

type RoomView = 'home' | 'chat'

interface UseWorkspaceNavigationReturn {
  clubId?: string
  roomId?: string
  roomView: RoomView
  openClub: (clubId: string) => void
  openRoom: (clubId: string, roomId: string) => void
  openChat: () => void
  closeChat: () => void
  goToClubList: () => void
  goUp: () => void
}

export function useWorkspaceNavigation(): UseWorkspaceNavigationReturn {
  const router = useRouter()
  const params = useLocalSearchParams<{ clubId?: string; roomId?: string; view?: string }>()

  return {
    clubId: params.clubId,
    roomId: params.roomId,
    roomView: params.view === 'chat' ? 'chat' : 'home',

    openClub(clubId: string) {
      router.push({ pathname: '/(app)/w/[clubId]', params: { clubId } })
    },

    openRoom(clubId: string, roomId: string) {
      router.push({ pathname: '/(app)/w/[clubId]/[roomId]', params: { clubId, roomId } })
    },

    openChat() {
      if (!params.clubId || !params.roomId) return
      router.push({
        pathname: '/(app)/w/[clubId]/[roomId]',
        params: { clubId: params.clubId, roomId: params.roomId, view: 'chat' },
      })
    },

    closeChat() {
      if (!params.clubId || !params.roomId) return
      router.push({
        pathname: '/(app)/w/[clubId]/[roomId]',
        params: { clubId: params.clubId, roomId: params.roomId, view: 'home' },
      })
    },

    goToClubList() {
      router.push('/(app)/w')
    },

    // 컴팩트 모드의 "뒤로" 어포던스 — 브라우저 back/안드로이드 하드웨어 back과
    // 동일하게 동작하도록 router.back()을 그대로 사용한다.
    goUp() {
      router.back()
    },
  }
}
