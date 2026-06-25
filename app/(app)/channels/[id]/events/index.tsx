// 이 파일은 list.tsx로 이전됐습니다.
// /events/index 경로로 직접 접근하면 list로 리다이렉트합니다.
import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

export default function EventsIndexRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    if (id) {
      router.replace({
        pathname: '/(app)/channels/[id]/events/list',
        params: { id },
      })
    }
  }, [id])

  return null
}
