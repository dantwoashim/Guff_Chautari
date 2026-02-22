
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://trtdqpeaqflgrmxybzql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRydGRxcGVhcWZsZ3JteHlienFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDE2NTYsImV4cCI6MjA4MjQxNzY1Nn0.85eKQhtzGn8QJpIWjP6473FBsNUj4ycVejLtwifizIg';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // Handle OAuth redirects
    storageKey: 'ashim-auth'  // [CRITICAL] Must match htdocs storage key
  }
});
