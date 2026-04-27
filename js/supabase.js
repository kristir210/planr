// This imports the Supabase library from a CDN (a public server)
// so we don't need to install anything
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// These two values identify your specific Supabase project
// The URL says "which project" and the key says "you're allowed in"
const SUPABASE_URL = 'https://dwsbqpuzqunkqratdixj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3c2JxcHV6cXVua3FyYXRkaXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDYxODYsImV4cCI6MjA5Mjg4MjE4Nn0.DGakTMxOo-z627ux2onb6V4UjkuDueObgHS5Ap6Xcsw'

// This creates the Supabase client — think of it as opening
// a phone line to your database. We export it so any other
// JS file can import it and use the same connection
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)