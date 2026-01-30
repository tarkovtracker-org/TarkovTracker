const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
const LOG_LEVEL = process.env.VITE_LOG_LEVEL || 'warn';

export const SHARED_DEFINE = {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
  'import.meta.env.VITE_LOG_LEVEL': JSON.stringify(LOG_LEVEL),
} as const satisfies Record<string, string>;
