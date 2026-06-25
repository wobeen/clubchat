// 이 파일은 detail.tsx로 이전됐습니다.
// /events/[eventId]/index 경로로 직접 접근하면 detail로 리다이렉트합니다.
import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function EventDetailIndexRedirect() {
  const { id, eventId, channelOwnerId = '' } = useLocalSearchParams<{
    id: string
    eventId: string
    channelOwnerId?: string
  }>()
  const router = useRouter()

  useEffect(() => {
    if (!eventId || !UUID_RE.test(eventId)) {
      router.back()
      return
    }
    router.replace({
      pathname: '/(app)/channels/[id]/events/[eventId]/detail',
      params: { id, eventId, channelOwnerId },
    })
  }, [eventId])

  return null
}
