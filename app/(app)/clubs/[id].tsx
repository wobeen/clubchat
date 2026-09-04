// 이전 동아리 홈 URL(/clubs/[id])을 보존하기 위한 얇은 리다이렉트 어댑터.
// 실제 화면은 app/(app)/w/[clubId]/index.tsx(+ src/features/shell/*)로 이전됐다.
import { Redirect, useLocalSearchParams } from 'expo-router'

export default function ClubDetailRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>()
  if (!id) return null
  return <Redirect href={{ pathname: '/(app)/w/[clubId]', params: { clubId: id } }} />
}
