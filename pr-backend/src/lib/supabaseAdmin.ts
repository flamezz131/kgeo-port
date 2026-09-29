import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import WebSocket from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables at startup.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: {
    schema: 'recommendation',
  },
  auth: {
    persistSession: false,
  },
});
