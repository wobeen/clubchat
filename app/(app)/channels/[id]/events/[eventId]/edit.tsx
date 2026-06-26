import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../../../../src/lib/supabase'
import { EventFormScreen } from '../../../../../../src/features/schedule'
import type { Event } from '../../../../../../src/features/schedule'

export default function EventEditPage() {
  const { id: channelId, eventId } = useLocalSearchParams<{
    id: string
    eventId: string
  }>()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId) return
    supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()
      .then(({ data }) => {
        setEvent(data as Event | null)
        setLoading(false)
      })
  }, [eventId])

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    )
  }

  if (!event || !channelId) return null

  return (
    <EventFormScreen
      channelId={channelId}
      event={event}
      onSaved={() => router.back()}
      onCancel={() => router.back()}
    />
  )
}
