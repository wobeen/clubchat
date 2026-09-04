// ─── 셸 전역에서 재사용하는 작은 헬퍼 ───────────────────────────────────────────
// app/(app)/index.tsx의 getClubColor/getInitials와 동일한 로직이다.
// IconRail(동아리 아바타)과 ClubListPane(ClubCard 배지)이 같은 동아리 id에 대해
// 항상 같은 색을 보여줘야 하므로 한 곳에 모았다.

import { badgeColors } from '../ui/theme'

export function getClubColor(id: string) {
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return badgeColors[hash % badgeColors.length]
}

export function getInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}
