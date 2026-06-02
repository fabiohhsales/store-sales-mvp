import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://chatsales-supabase.yvssrw.easypanel.host'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('--- Inspecting panel_users ---')
  const { data: users, error: usersError } = await supabase
    .from('panel_users')
    .select('*')
  if (usersError) {
    console.error('Error fetching panel_users:', usersError)
  } else {
    console.log(JSON.stringify(users, null, 2))
  }

  console.log('--- Inspecting stores ---')
  const { data: stores, error: storesError } = await supabase
    .from('stores')
    .select('*')
  if (storesError) {
    console.error('Error fetching stores:', storesError)
  } else {
    console.log(JSON.stringify(stores, null, 2))
  }

  console.log('--- Inspecting panel_clients ---')
  const { data: clients, error: clientsError } = await supabase
    .from('panel_clients')
    .select('*')
  if (clientsError) {
    console.error('Error fetching panel_clients:', clientsError)
  } else {
    console.log(JSON.stringify(clients, null, 2))
  }
}

run().catch(console.error)
