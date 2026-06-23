import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import { Database } from '../types/supabase'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 웹에서 AsyncStorage(localStorage 래퍼)를 쓰면 Supabase 세션 초기화와
    // 첫 REST 요청 사이에 JWT가 누락되는 타이밍 문제가 생길 수 있다.
    // 웹은 기본 storage(localStorage 직접 접근)를 사용하고,
    // 네이티브만 AsyncStorage를 사용한다.
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
})
