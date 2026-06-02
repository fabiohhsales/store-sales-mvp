import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://chatsales-supabase.yvssrw.easypanel.host'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('--- Inspecting store_accounts ---')
  const { data: accounts, error: accError } = await supabase
    .from('store_accounts')
    .select('*')
  if (accError) {
    console.error('Error fetching store_accounts:', accError)
  } else {
    console.log(`Found ${accounts?.length || 0} accounts:`)
    console.log(JSON.stringify(accounts, null, 2))
  }

  console.log('--- Inspecting store_stores ---')
  const { data: stores, error: storesError } = await supabase
    .from('store_stores')
    .select('*')
  if (storesError) {
    console.error('Error fetching store_stores:', storesError)
  } else {
    console.log(`Found ${stores?.length || 0} stores:`)
    console.log(JSON.stringify(stores, null, 2))
  }
}

run().catch(console.error)
