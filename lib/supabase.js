import 'react-native-url-polyfill/auto'        // required for supabase-js in RN
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL       // same project, EXPO_ prefix
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,        // persists the session on-device
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,    // RN has no URL bar to parse a session from
  },
})