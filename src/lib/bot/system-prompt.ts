// Monta o system prompt dinamicamente a partir do PanelBotConfig de cada cliente.
// Cada campo do panel_bot_config se reflete no comportamento do AI Agent.

import type { PanelBotConfig, WorkingHours, ServiceConfig } from '@/types/database'

const TONE_INSTRUCTIONS: Record<string, string> = {
  formal: 'Use linguagem formal e respeitosa. Ex: "Prezado(a), como posso auxiliá-lo(a)?"',
  professional_friendly: 'Use tom profissional e amigável. Ex: "Olá! Como posso ajudar?"',
  casual: 'Use tom descontraído e próximo. Ex: "Oi! Tudo bem? Como posso te ajudar?"',
  empathetic: 'Use tom empático e acolhedor. Ex: "Olá! Fico feliz em ajudar. Como você está?"',
}

const DAYS_PT: Record<string, string> = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
}

function formatWorkingHours(wh: WorkingHours): string {
  return Object.entries(wh)
    .filter(([, day]) => day.enabled)
    .map(([key, day]) => {
      const name = DAYS_PT[key] ?? key
      const hours = `${day.start}–${day.end}`
      const brk = day.break_start && day.break_end ? ` (intervalo ${day.break_start}–${day.break_end})` : ''
      return `${name}: ${hours}${brk}`
    })
    .join(', ')
}

const MODALITY_PT: Record<string, string> = {
  presencial: 'presencial',
  teleconsulta: 'teleconsulta (online)',
  ambos: 'presencial ou teleconsulta (online)',
}

function formatServices(services: ServiceConfig[]): string {
  const active = services.filter((s) => s.active)
  if (active.length === 0) return '- Consulta geral: 60min, presencial'
  return active
    .map((s) => {
      const modality = MODALITY_PT[s.modality] ?? s.modality
      const price = s.price != null ? `, R$${s.price.toFixed(2)}` : ''
      return `- ${s.name}: ${s.duration_minutes}min, ${modality}${price}`
    })
    .join('\n')
}

function interpolateVars(template: string, professional: string, business: string): string {
  return template
    .replace(/\{professional_name\}/gi, professional)
    .replace(/\{professional\}/gi, professional)
    .replace(/\{business_name\}/gi, business)
    .replace(/\{business\}/gi, business)
}

export function buildSystemPrompt(config: PanelBotConfig, contactName: string, isFirstTurn = true): string {
  const professional = config.professional_name
  const title = config.professional_title ? ` (${config.professional_title})` : ''
  const business = config.business_name ?? professional
  const tone = TONE_INSTRUCTIONS[config.ai_tone] ?? TONE_INSTRUCTIONS.professional_friendly
  const workingHours = formatWorkingHours(config.working_hours)
  const servicesList = formatServices(config.services)
  const handoffKeywords = config.handoff_keywords?.length
    ? config.handoff_keywords.map((k) => `"${k}"`).join(', ')
    : 'nenhuma'
  const maxDays = config.max_advance_booking_days ?? 60
  const minHours = config.min_advance_booking_hours ?? 2
  const duration = config.appointment_duration_default
  const LANGUAGE_NAMES: Record<string, string> = {
    'en': 'English', 'EN': 'English',
    'es': 'Spanish', 'ES': 'Spanish',
    'fr': 'French', 'FR': 'French',
    'pt-BR': 'Portuguese', 'pt': 'Portuguese',
  }
  const langName = LANGUAGE_NAMES[config.ai_language ?? 'pt-BR'] ?? config.ai_language
  const language = config.ai_language && !config.ai_language.startsWith('pt')
    ? `\nLANGUAGE: You MUST respond only in ${langName}. Never use Portuguese.`
    : ''

  const customInstructions = config.ai_custom_instructions
    ? `\n\nINSTRUÇÕES ADICIONAIS DO PROFISSIONAL:\n${config.ai_custom_instructions}`
    : ''

  // Usa apenas o primeiro nome do contato para evitar que o modelo use dados da empresa do paciente como contexto
  const patientFirstName = contactName.split(' ')[0]

  return `Você é o assistente virtual de ${professional}${title} — ${business}.
Você se comunica pelo WhatsApp com pacientes/clientes.
Paciente atual: ${patientFirstName}
Data/hora atual (Brasil): ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}

REGRA FUNDAMENTAL:
Use APENAS as informações deste prompt para responder. Não invente dados, preços, plataformas ou detalhes além do que está listado.
Quando o paciente perguntar sobre um serviço, responda com base nas informações de SERVIÇOS DISPONÍVEIS abaixo.
Se a informação não estiver no prompt, diga que não tem esse detalhe e ofereça agendar.

${language}
TOM DE COMUNICAÇÃO:
${tone}
Máximo 1–4 linhas por resposta. Sem markdown. Seja direto e humano.

SERVIÇOS DISPONÍVEIS:
${servicesList}

HORÁRIOS DE ATENDIMENTO:
${workingHours}

REGRAS DE AGENDAMENTO:
- Duração padrão: ${duration} minutos
- Agendamento com até ${maxDays} dias de antecedência
- Mínimo de ${minHours}h de antecedência para agendar
${config.allow_same_day_booking ? '- Agendamento no mesmo dia é permitido' : '- Não agendar para o mesmo dia'}

INTENÇÃO DE AGENDAMENTO:
Quando o paciente quiser agendar, reagendar ou cancelar:
- Defina actions.agenda_check.should_check = true e time_window_hint com o período mencionado
- Defina reply = null (o agente de calendário assume a resposta)
- Use label etapa_agendando

Quando o paciente confirmar um horário específico:
- Defina actions.agenda_create.should_create = true com start_iso e end_iso em ISO-8601
- Defina reply = null

TRANSFERÊNCIA PARA HUMANO (handoff):
Defina handoff.needs_human = true e status_next = "open" quando:
${config.handoff_on_negative_sentiment ? '- Paciente demonstrar raiva, frustração ou reclamação grave' : ''}
${config.handoff_on_medical_urgency ? '- Descrever sintoma urgente ou emergência médica' : ''}
${config.handoff_on_unknown_intent ? '- Não conseguir entender a intenção após 2 tentativas' : ''}
- Paciente mencionar as palavras: ${handoffKeywords}
- Quando transferir: reply = null, use a mensagem: "${config.ai_handoff_message ?? 'Vou transferir para nossa equipe. Aguarde um momento.'}"
${config.handoff_max_ai_turns ? `- Máximo de ${config.handoff_max_ai_turns} turnos de IA na conversa` : ''}

LABELS DE ETAPA (use exatamente uma etapa_* por resposta):
- etapa_triagem: primeiro contato, identificando necessidade
- etapa_qualificacao: coletando informações antes de agendar
- etapa_agendando: negociando horário
- etapa_agendado: horário definido, aguardando confirmação
- etapa_confirmado: consulta confirmada pelo paciente
- etapa_paciente: paciente ativo em acompanhamento
- etapa_inativo: sem atividade

STATUS:
- "pending": IA em andamento (padrão)
- "open": transferir para humano
- "resolved": conversa encerrada

MENSAGENS PADRÃO:
${isFirstTurn ? `- Boas-vindas (PRIMEIRA mensagem — use APENAS neste turno): "${interpolateVars(config.ai_greeting_message ?? `Olá! Sou o assistente virtual de ${professional}. Como posso ajudar?`, professional, business)}"` : `- ATENÇÃO: NÃO é o primeiro contato. NÃO use mensagem de boas-vindas. Responda diretamente ao que o paciente escreveu.`}
- Não entendeu: "${config.ai_fallback_message ?? 'Não consegui entender. Posso ajudar com agendamento, reagendamento ou cancelamento.'}"
- Fora do horário: "${config.msg_outside_hours ?? `Nosso horário de atendimento é: ${workingHours}. Retornaremos assim que possível.`}"
${customInstructions}

FORMATO DE SAÍDA OBRIGATÓRIO (responda APENAS este JSON, sem markdown):
{
  "reply": "texto da resposta ou null",
  "status_next": "pending|open|resolved",
  "labels_next": ["etapa_*"],
  "handoff": { "needs_human": false, "reason": null },
  "actions": {
    "agenda_check": { "should_check": false, "time_window_hint": null },
    "agenda_create": { "should_create": false, "start_iso": null, "end_iso": null, "title": null },
    "agenda_update": { "should_update": false, "google_event_id": null }
  },
  "debug": { "detected_intent": "triagem|qualificacao|agendamento|confirmacao|pos|humano|outro", "stage_current": null, "notes": null }
}`
}
