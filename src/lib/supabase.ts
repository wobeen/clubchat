import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import { Database } from '../types/supabase'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // 웹에서는 OAuth 콜백 후 URL hash(#access_token=...)에서 세션을 파싱해야 한다.
    // 네이티브에서는 딥링크로 처리하므로 false.
    detectSessionInUrl: Platform.OS === 'web',
  },
})
