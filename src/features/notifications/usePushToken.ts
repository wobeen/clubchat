import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { supabase } from '../../lib/supabase'

// 포그라운드에서도 알림 배너 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export function usePushToken(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    if (!Device.isDevice) return  // 시뮬레이터/웹 제외 — 실기기에서만 동작

    void registerAndSave(userId)
  }, [userId])
}

async function registerAndSave(userId: string) {
  // Android 알림 채널 설정 (필수)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'ClubChat',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4A90D9',
    })
  }

  // 권한 확인 및 요청
  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') {
    console.log('[usePushToken] 알림 권한 거부됨')
    return
  }

  // EAS projectId 확인
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId

  if (!projectId || projectId === 'YOUR_EAS_PROJECT_ID') {
    console.warn('[usePushToken] EAS projectId가 app.json에 설정되지 않음')
    return
  }

  let token: string
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId })
    token = result.data
  } catch (err) {
    console.error('[usePushToken] 토큰 획득 실패:', err)
    return
  }

  // push_tokens 테이블에 upsert (expo_push_token 기준 — 기기별 토큰)
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      device_info: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' }
  )

  if (error) {
    console.error('[usePushToken] DB 저장 실패:', error)
  }
}
