import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://chatsales-supabase.yvssrw.easypanel.host'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Testing connection to remote Supabase...')
  
  const { data: users, error: usersError } = await supabase
    .from('panel_users')
    .select('*')
    .limit(1)

  if (usersError) {
    console.error('Error querying panel_users:', usersError)
  } else {
    console.log('Successfully queried panel_users. Results count:', users?.length)
  }

  const { data: migrations, error: migError } = await supabase
    .from('_schema_migrations')
    .select('*')
    .order('name', { ascending: false })

  if (migError) {
    console.error('Error querying _schema_migrations:', migError)
  } else {
    console.log('Applied migrations count:', migrations?.length)
    console.log('Latest 10 migrations applied:')
    console.log(migrations?.slice(0, 10))
  }
}

run().catch(console.error)
