import type { Href } from 'expo-router'

// 로그인 전에 초대 딥링크(예: clubchat://join?token=xxx)로 앱에 들어온 경우,
// 로그인 화면으로 리다이렉트되면서 목적지 정보가 사라지지 않도록 잠깐 보관해둔다.
// 로그인이 끝나면 root layout이 이 값을 소비해 원래 목적지로 이동시킨다.

let pendingHref: Href | null = null

export function setPendingDeepLink(href: Href) {
  pendingHref = href
}

export function consumePendingDeepLink(): Href | null {
  const href = pendingHref
  pendingHref = null
  return href
}
