import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://puvhqusauipotmiicrrm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ie07f0f9_X8VuS5LPxPD-g_fTxCoPHN';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});