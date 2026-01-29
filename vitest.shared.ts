const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
const logLevel = process.env.VITE_LOG_LEVEL || 'warn';

export const sharedDefine = {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
  'import.meta.env.VITE_LOG_LEVEL': JSON.stringify(logLevel),
};
