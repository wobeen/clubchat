// ─── 셸 전역에서 재사용하는 작은 헬퍼 ───────────────────────────────────────────
// 동아리 아이콘은 동아리마다 색이 다르면 목록이 뒤섞여 보인다는 피드백이 있어
// 더 이상 id를 해시해서 색을 고르지 않는다 — 항상 고정된 기본색 하나를 쓴다.
// 스터디(방)도 마찬가지로 항상 다른 고정색 하나를 쓰되, 동아리와는 구분되는
// 톤을 쓴다(iconPalette 참고).
//
// 이 두 함수는 "커스텀 이미지가 없을 때의 기본 배지 색"만 책임진다. 나중에
// 동아리/방에 사용자가 이미지를 업로드하는 기능이 생기면, 호출부가 그 이미지
// URL이 있는지 먼저 확인해서 있으면 <Image>를, 없으면 이 함수가 반환한 색으로
// EntityAvatar(./EntityAvatar.tsx)를 그리면 된다 — 이 함수 자체를 바꿀 필요는
// 없다.

import { clubDefaultIconColor, roomDefaultIconColor } from '../ui/theme'

export function getClubColor(_id?: string) {
  return clubDefaultIconColor
}

export function getRoomColor(_id?: string) {
  return roomDefaultIconColor
}

export function getInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}
