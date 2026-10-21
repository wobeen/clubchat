export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('')
}

export const AVATAR_COLORS = [
  { bg: '#95E4F3', text: '#1EA8C4' },
  { bg: '#42F2F2', text: '#0F9797' },
  { bg: '#24F8AE', text: '#0FA876' },
  { bg: '#63AB3F', text: '#191F28' },
  { bg: '#EBF0F0', text: '#6B7684' },
]

export function getAvatarColor(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
