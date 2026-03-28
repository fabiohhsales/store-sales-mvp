const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
const BASE = 'https://chatsales-supabase.yvssrw.easypanel.host';

async function q(label, sql) {
  const r = await fetch(BASE + '/pg/query', {
    method: 'POST',
    headers: { 'apikey': SRK, 'Authorization': 'Bearer ' + SRK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const d = await r.json();
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(d, null, 2).substring(0, 500));
}

(async () => {
  await q('004: followup_cadence_steps table',
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='followup_cadence_steps' ORDER BY ordinal_position");

  await q('004: lead/atendimento/agendado followup columns',
    "SELECT column_name FROM information_schema.columns WHERE table_name='panel_bot_config' AND column_name LIKE '%followup%' ORDER BY column_name");

  await q('005: stage_labels column',
    "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='panel_bot_config' AND column_name='stage_labels'");

  await q('006: prompt guide columns',
    "SELECT column_name FROM information_schema.columns WHERE table_name='panel_bot_config' AND column_name LIKE '%_guide' ORDER BY column_name");

  console.log('\n✅ Verification complete');
})();
