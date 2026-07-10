import * as Linking from 'expo-linking'
import Constants from 'expo-constants'

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

// Linking.createURL()은 웹에서 window.location.origin(예: http://localhost:8081)을
// 기준으로 링크를 만들어서, QR/공유 링크로 쓰면 폰에서 열었을 때 로컬호스트라 열리지
// 않는다. 이 초대 링크는 항상 네이티브 앱(clubchat://)을 여는 용도이므로 플랫폼에
// 상관없이 커스텀 스킴을 직접 만든다.
export function buildInviteLink(token: string): string {
  const scheme = Constants.expoConfig?.scheme
  const resolvedScheme = (Array.isArray(scheme) ? scheme[0] : scheme) ?? 'clubchat'
  return `${resolvedScheme}://join?token=${encodeURIComponent(token)}`
}
