import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://dwsbqpuzqunkqratdixj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3c2JxcHV6cXVua3FyYXRkaXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDYxODYsImV4cCI6MjA5Mjg4MjE4Nn0.DGakTMxOo-z627ux2onb6V4UjkuDueObgHS5Ap6Xcsw'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)