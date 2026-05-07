"""Script para preencher FOLLOWUP_BASELINE.md com dados reais do Supabase"""
import sys
import os
from datetime import datetime, timedelta

# Carregar credenciais
sys.path.insert(0, r"C:\Users\Pichau\Documents\Skills")
from load_credentials import load_env, get_required

load_env()

# Importar supabase
try:
    from supabase import create_client, Client
except ImportError:
    print("Instalando supabase-py...")
    os.system("pip install supabase -q")
    from supabase import create_client, Client

# Conectar Supabase
SUPABASE_URL = get_required("SUPABASE_URL")
SUPABASE_KEY = get_required("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("✅ Conectado ao Supabase")
print(f"URL: {SUPABASE_URL}\n")

# ========================================
# SEÇÃO 2: Dados Gerais do Sistema
# ========================================

print("=" * 60)
print("SEÇÃO 2: Dados Gerais do Sistema")
print("=" * 60)

# Query dados gerais via API REST
clientes_ativos = supabase.table('panel_clients').select('id', count='exact').eq('status', 'active').execute().count or 0
conversas_ativas = supabase.table('conversations').select('id', count='exact').neq('status', 'resolved').execute().count or 0
em_atendimento = supabase.table('conversations').select('id', count='exact').neq('status', 'resolved').eq('stage', 'in_service').execute().count or 0
aguardando_humano = supabase.table('conversations').select('id', count='exact').neq('status', 'resolved').eq('stage', 'awaiting_human').execute().count or 0
em_triagem = supabase.table('conversations').select('id', count='exact').neq('status', 'resolved').eq('stage', 'bot_triage').execute().count or 0
resolvidas = supabase.table('conversations').select('id', count='exact').eq('status', 'resolved').execute().count or 0

# Appointments - usar data atual como referência
now_iso = datetime.now().isoformat()
appointments_futuros = supabase.table('appointments').select('id', count='exact').gt('start_at', now_iso).execute().count or 0
appointments_confirmados = supabase.table('appointments').select('id', count='exact').eq('status', 'confirmed').execute().count or 0

dados_gerais = {
    'clientes_ativos': clientes_ativos,
    'conversas_ativas': conversas_ativas,
    'em_atendimento': em_atendimento,
    'aguardando_humano': aguardando_humano,
    'em_triagem': em_triagem,
    'resolvidas': resolvidas,
    'appointments_futuros': appointments_futuros,
    'appointments_confirmados': appointments_confirmados
}

print(f"Total de clientes ativos: {clientes_ativos}")
print(f"Total de conversas ativas: {conversas_ativas}")
print(f"Total em atendimento (in_service): {em_atendimento}")
print(f"Total aguardando humano: {aguardando_humano}")
print(f"Total em triagem (bot): {em_triagem}")
print(f"Total resolvidas: {resolvidas}")
print(f"Appointments futuros: {appointments_futuros}")
print(f"Appointments confirmados: {appointments_confirmados}")

# ========================================
# SEÇÃO 3: Steps Enviados (últimos 7 dias)
# ========================================

print("\n" + "=" * 60)
print("SEÇÃO 3: Steps Enviados (últimos 7 dias)")
print("=" * 60)

# Query 3.1: Steps enviados por cadência
# Calcular data 7 dias atrás
seven_days_ago = (datetime.now() - timedelta(days=7)).isoformat()
response = supabase.table('followup_cadence_steps').select(
    'cadence_type',
    count='exact'
).gte('sent_at', seven_days_ago).execute()

steps_por_cadencia = {}
total_steps = response.count if response.count else 0

# Agrupar por cadence_type
for row in response.data:
    ct = row.get('cadence_type')
    if ct not in steps_por_cadencia:
        steps_por_cadencia[ct] = 0
    steps_por_cadencia[ct] += 1

print(f"\nTotal de steps enviados (7 dias): {total_steps}")
for cadence, count in steps_por_cadencia.items():
    print(f"  {cadence}: {count}")

# Query 3.2: Distribuição por step_key
response_steps = supabase.table('followup_cadence_steps').select(
    'cadence_type, step_key'
).gte('sent_at', seven_days_ago).execute()

steps_distribuicao = {}
for row in response_steps.data:
    ct = row.get('cadence_type')
    sk = row.get('step_key')
    key = f"{ct}_{sk}"
    if key not in steps_distribuicao:
        steps_distribuicao[key] = 0
    steps_distribuicao[key] += 1

print("\nDistribuição por step:")
for key, count in sorted(steps_distribuicao.items()):
    print(f"  {key}: {count}")

# ========================================
# SEÇÃO 4: Motivos de Skip
# ========================================

print("\n" + "=" * 60)
print("SEÇÃO 4: Motivos de Skip (últimos 7 dias)")
print("=" * 60)

try:
    response_logs = supabase.table('followup_logs').select(
        'skip_reason'
    ).eq('status', 'skipped').gte('created_at', seven_days_ago).execute()
    
    skip_reasons = {}
    for row in response_logs.data:
        reason = row.get('skip_reason', 'unknown')
        if reason not in skip_reasons:
            skip_reasons[reason] = 0
        skip_reasons[reason] += 1
    
    total_skips = sum(skip_reasons.values())
    print(f"\nTotal de skips: {total_skips}")
    for reason, count in sorted(skip_reasons.items(), key=lambda x: x[1], reverse=True):
        pct = (count / total_skips * 100) if total_skips > 0 else 0
        print(f"  {reason}: {count} ({pct:.2f}%)")
except Exception as e:
    print(f"⚠️  Tabela followup_logs não existe ou sem dados: {e}")

# ========================================
# SEÇÃO 6: Conversas com Humano Parado
# ========================================

print("\n" + "=" * 60)
print("SEÇÃO 6: Conversas com Humano Parado")
print("=" * 60)

response_in_service = supabase.table('conversations').select(
    'id, last_outgoing_at, last_incoming_at'
).neq('status', 'resolved').eq('stage', 'in_service').execute()

total_in_service = len(response_in_service.data)
now = datetime.now()

stagnated_24h = 0
stagnated_48h = 0
stagnated_7d = 0

for conv in response_in_service.data:
    last_activity = conv.get('last_outgoing_at') or conv.get('last_incoming_at')
    if last_activity:
        last_dt = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
        hours_ago = (now - last_dt.replace(tzinfo=None)).total_seconds() / 3600
        
        if hours_ago > 24:
            stagnated_24h += 1
        if hours_ago > 48:
            stagnated_48h += 1
        if hours_ago > 168:  # 7 days
            stagnated_7d += 1

print(f"\nTotal em in_service: {total_in_service}")
print(f"Com última mensagem > 24h: {stagnated_24h}")
print(f"Com última mensagem > 48h: {stagnated_48h}")
print(f"Com última mensagem > 7 dias: {stagnated_7d}")

# ========================================
# SEÇÃO 9: Status de Conexão
# ========================================

print("\n" + "=" * 60)
print("SEÇÃO 9: Status de Conexão")
print("=" * 60)

# WhatsApp
response_whatsapp = supabase.table('panel_whatsapp_config').select('connection_status').execute()
whatsapp_status = {}
for row in response_whatsapp.data:
    status = row.get('connection_status', 'unknown')
    if status not in whatsapp_status:
        whatsapp_status[status] = 0
    whatsapp_status[status] += 1

print("\nWhatsApp Status:")
for status, count in whatsapp_status.items():
    print(f"  {status}: {count}")

# Google Calendar
response_google = supabase.table('panel_google_config').select('refresh_token').execute()
configured = sum(1 for row in response_google.data if row.get('refresh_token'))
not_configured = len(response_google.data) - configured

print("\nGoogle Calendar:")
print(f"  Configurado: {configured}")
print(f"  Não configurado: {not_configured}")

# ========================================
# RESULTADO FINAL
# ========================================

print("\n" + "=" * 60)
print("✅ BASELINE COLETADO COM SUCESSO")
print("=" * 60)

baseline_data = {
    "data_coleta": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "clientes_ativos": dados_gerais.get('clientes_ativos', 0),
    "conversas_ativas": dados_gerais.get('conversas_ativas', 0),
    "em_atendimento": dados_gerais.get('em_atendimento', 0),
    "aguardando_humano": dados_gerais.get('aguardando_humano', 0),
    "em_triagem": dados_gerais.get('em_triagem', 0),
    "resolvidas": dados_gerais.get('resolvidas', 0),
    "appointments_futuros": dados_gerais.get('appointments_futuros', 0),
    "appointments_confirmados": dados_gerais.get('appointments_confirmados', 0),
    "total_steps_7d": total_steps,
    "steps_por_cadencia": steps_por_cadencia,
    "steps_distribuicao": steps_distribuicao,
    "skip_reasons": skip_reasons if 'skip_reasons' in locals() else {},
    "total_in_service": total_in_service,
    "stagnated_24h": stagnated_24h,
    "stagnated_48h": stagnated_48h,
    "stagnated_7d": stagnated_7d,
    "whatsapp_status": whatsapp_status,
    "google_configured": configured,
    "google_not_configured": not_configured
}

# Salvar JSON para processamento posterior
import json
output_file = "baseline_data.json"
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(baseline_data, f, indent=2, ensure_ascii=False)

print(f"\n📄 Dados salvos em: {output_file}")
print("\nPróximo passo: Atualizar FOLLOWUP_BASELINE.md com estes dados")
