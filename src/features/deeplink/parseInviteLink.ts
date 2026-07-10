import * as Linking from 'expo-linking'

// clubchat://join?token=xxx (또는 exp://.../--/join?token=xxx, https 유니버설 링크 등)
// 형태의 URL에서 초대 토큰만 뽑아낸다. 초대 링크가 아니면 null.
export function parseInviteToken(url: string): string | null {
  try {
    const { hostname, path, queryParams } = Linking.parse(url)
    // 커스텀 스킴(clubchat://join)은 세그먼트가 하나뿐이면 path가 아니라
    // hostname으로 파싱되는 경우가 있어 둘 다 확인한다.
    const target = path ?? hostname
    if (target !== 'join') return null

    const token = queryParams?.token
    if (typeof token !== 'string' || !token) return null
    return token
  } catch {
    return null
  }
}

export function buildInviteLink(token: string): string {
  return Linking.createURL('join', { queryParams: { token } })
}
