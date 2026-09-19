import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bpcvnedueofvttcvnvel.supabase.co'
const supabaseAnonKey = 'sb_publishable_yP6v1vSITBDyFXVaX95bcA_7ERQ2yFT'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
