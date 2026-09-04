// 이전 마이 페이지 URL을 보존하기 위한 얇은 리다이렉트 어댑터.
// 실제 화면은 app/(app)/w/index.tsx(+ src/features/shell/*)로 이전됐다.
import { Redirect } from 'expo-router'

export default function ClubListRedirect() {
  return <Redirect href="/(app)/w" />
}
