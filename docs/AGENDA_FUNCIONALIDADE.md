# Agenda - Documentacao Completa de Funcionalidade

## 1. Visao geral

A funcionalidade de Agenda no painel tem dois objetivos principais:

1. Exibir e operar agendamentos (listar, filtrar, atualizar status) para o cliente.
2. Alimentar o ciclo de agendamento automatico via IA (checagem de disponibilidade, criacao de evento no Google Calendar e follow-up pre-consulta).

Ela funciona integrada a:

- Interface admin (aba Agenda).
- Embed no Chatwoot (Dashboard App de Agenda).
- APIs internas de Agenda.
- Supabase (tabelas operacionais e de configuracao).
- Google Calendar (conta central com refresh token).
- Pipeline de bot (intencao de agendamento e criacao de consulta).

## 2. Entradas de uso (UI)

### 2.1 Agenda no painel admin

- Pagina carrega clientes ativos/pausados.
- Usuario seleciona cliente (quando ha mais de um).
- Tabela renderiza agendamentos do cliente.
- Filtros:
  - Periodo: Hoje, Semana, Mes, Todos.
  - Status: Todos, Agendado, Confirmado, Compareceu, Nao compareceu, Cancelado.
- Acoes por linha:
  - Marcar como Compareceu.
  - Marcar como Faltou.

### 2.2 Agenda embutida no Chatwoot

- URL de embed recebe `token` na query string.
- Front chama autenticacao por token.
- Ao validar token, sistema descobre `client_id`.
- Carrega a mesma tabela da Agenda, mas autenticada por token (sem sessao admin).

## 3. Modelo de autenticacao

A API da agenda aceita dois modos:

1. **Sessao Supabase (admin logado)**
- Recebe `client_id`.
- Valida usuario autenticado.

2. **Token embed (Chatwoot app)**
- Recebe `token`.
- Consulta `panel_embed_tokens`.
- Atualiza `last_used_at` do token.

Esse design permite reuso da mesma API para painel e embed.

## 4. Fluxo funcional ponta a ponta

## 4.1 Listagem na Agenda

1. Front monta parametros (`client_id` ou `token`, `date_from`, `date_to`, `status`).
2. Chama `GET /api/agenda`.
3. API autentica origem (token ou sessao).
4. API resolve `chatwoot_account_id` do cliente:
   - Primeiro em `panel_whatsapp_config`.
   - Fallback em `panel_clients`.
5. API consulta `appointments` com join em:
   - `conversations` (filtro por account_id).
   - `contacts` (nome/telefone para exibicao).
6. Retorna payload normalizado para a tabela.

## 4.2 Atualizacao de status pela UI

1. Front chama `PATCH /api/agenda/{id}/status` com novo status.
2. API valida status permitido.
3. API autentica origem (token ou sessao).
4. Atualiza `appointments.status` e `updated_at`.
5. Front aplica update otimista na lista e exibe toast.

## 4.3 Criacao automatica de agendamento (via bot)

1. Agente IA identifica intencao no output estruturado:
   - `actions.agenda_check.should_check`
   - `actions.agenda_create.should_create`
2. Dispatcher aciona `calendar-agent`.
3. Para checagem:
   - Interpreta janela de tempo (com IA mini para parse semantico).
   - Consulta disponibilidade no Google Calendar (`freebusy`).
   - Calcula slots conforme regras de configuracao.
   - Envia opcoes no WhatsApp.
   - Persiste slots em `conversations.pending_slots`.
4. Para criacao:
   - Cria evento no Google Calendar.
   - Opcionalmente cria Google Meet.
   - Persiste registro em `appointments`.
   - Atualiza conversa para etapa agendada.
   - Envia confirmacao ao paciente.

## 4.4 Follow-up de agendados (cadencia)

- Cron dedicado consulta agendamentos futuros e dispara mensagens em marcos:
  - D-2
  - -3h
  - -5min
- Idempotencia por `followup_cadence_steps` (unique por conversa/cadencia/step).

## 5. Dependencias tecnicas

## 5.1 Runtime e framework

- Next.js App Router.
- React (client components na tabela e filtros).
- Supabase (Auth + Postgres via JS client).

## 5.2 Bibliotecas de UI e utilitarios

- Shadcn/UI (Table, Select, Dialog, Button, Badge, Skeleton).
- `lucide-react` (icones).
- `sonner` (toasts).

## 5.3 Integracoes externas

- Google Calendar API (`googleapis`) para:
  - `freebusy.query`.
  - `events.insert`.
  - `events.patch`.
  - `events.delete`.
- OpenAI client para interpretar `time_window_hint` (janela semantica).
- Evolution API para envio de mensagens WhatsApp.
- Chatwoot (conta/labels/status) no pipeline.

## 5.4 Variaveis de ambiente criticas

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- Variaveis de Supabase (admin e server)
- `CRON_SECRET` (rotas cron)

Sem `GOOGLE_REFRESH_TOKEN`, o fluxo automatico de agenda fica indisponivel.

## 6. Banco de dados e vinculos

## 6.1 Tabelas principais usadas pela Agenda

### Operacionais

- `appointments`
  - Registro principal de cada consulta/agendamento.
  - Campos relevantes: `id`, `conversation_id`, `contact_id`, `title`, `start_at`, `end_at`, `status`, `meet_link`, `google_event_id`, `confirmation_sent_at`, `reminder_sent_at`, `updated_at`.

- `conversations`
  - Usada para filtrar por `account_id` e para manter estado conversacional (`pending_slots`, `appointment_status`, labels, followup).

- `contacts`
  - Fonte de nome e telefone para exibir na tabela de agenda e para follow-up.

### Configuracao de cliente

- `panel_whatsapp_config`
  - Fonte prioritaria de `chatwoot_account_id` para isolar dados por cliente.

- `panel_clients`
  - Fallback para `chatwoot_account_id`.

- `panel_google_config`
  - Configura calendario por cliente (`calendar_id`, `google_email`).

- `panel_bot_config`
  - Regras de agenda e templates:
    - Horarios (`working_hours`).
    - Duracao e buffer.
    - Limites de antecedencia.
    - Templates de evento.
    - Config Meet e convites.
    - Mensagens de follow-up.

- `panel_embed_tokens`
  - Tokenizacao para embeds do Chatwoot (incluindo Agenda).

### Follow-up

- `followup_cadence_steps`
  - Idempotencia dos envios por etapa da cadencia agendada.

- `followup_logs`
  - Historico de mensagens enviadas por workflows.

## 6.2 Relacao logica da Agenda com o DB

A agenda e multitenant por account do Chatwoot:

1. Requisicao autenticada resolve `client_id`.
2. `client_id` resolve `chatwoot_account_id`.
3. Consulta `appointments` somente de conversas desse account.
4. Assim, uma conta cliente nao enxerga agendamentos de outra.

## 7. Consultas principais (Supabase)

## 7.1 Listagem de agenda (API)

Padrao de consulta:

- Base: `appointments`
- Join interno:
  - `contacts!inner(name, phone_number)`
  - `conversations!inner(account_id)`
- Filtros:
  - `conversations.account_id = chatwootAccountId`
  - `start_at >= date_from`
  - `start_at <= date_to 23:59:59`
  - `status = statusFilter` (quando diferente de all)
- Ordenacao:
  - `start_at` ascendente

## 7.2 Update de status

- Tabela: `appointments`
- Filtro: `id = appointmentId`
- Update: `status`, `updated_at`

## 7.3 Follow-up agendado

- Busca `conversations` do account.
- Busca `appointments` `status='scheduled'` em janela futura.
- Busca `contacts` relacionados para entregar mensagem.
- Registra reserva idempotente em `followup_cadence_steps`.

## 7.4 Criacao de appointment ao criar evento Google

- Insert em `appointments` com:
  - `conversation_id`, `contact_id`
  - `google_event_id`
  - `title`, `start_at`, `end_at`
  - `status='scheduled'`
  - `meet_link`

## 8. Contratos de API da Agenda

## 8.1 GET /api/agenda

### Entrada

Query params:

- `token` **ou** `client_id`
- `date_from` (opcional)
- `date_to` (opcional)
- `status` (opcional)

### Saida

Array de agendamentos para renderizacao da tabela:

- `id`
- `conversation_id`
- `contact_name`
- `contact_phone`
- `title`
- `start_at`
- `end_at`
- `modality`
- `status`
- `meet_link`
- `google_event_id`
- `confirmation_sent_at`
- `confirmation_response`
- `created_at`

## 8.2 PATCH /api/agenda/{id}/status

### Entrada

Body JSON:

- `status` (valores aceitos: `attended`, `no_show`, `cancelled`, `rescheduled`, `scheduled`)
- `token` ou `client_id`

### Saida

Registro atualizado (`id`, `status`).

## 9. Configuracoes que impactam a Agenda

No `panel_bot_config`:

- `working_hours`
- `appointment_duration_default`
- `appointment_buffer_minutes`
- `max_advance_booking_days`
- `min_advance_booking_hours`
- `allow_same_day_booking`
- `calendar_event_title_template`
- `calendar_event_description_template`
- `calendar_create_meet_link`
- `calendar_send_invite_to_patient`
- `calendar_color_id`
- templates de follow-up agendado (`agendado_followup_msg_*`)

No `panel_google_config`:

- `calendar_id`
- `google_email`

## 10. Integracao com Chatwoot

A Agenda no Chatwoot e disponibilizada como Dashboard App:

1. Setup cria dois tokens embed (`Pipeline` e `Agenda`).
2. Setup cria dois apps no Chatwoot com URLs contendo token.
3. App de Agenda aponta para `/chatwoot/agenda?token=...`.
4. Front valida token e carrega `AgendaTable`.

## 11. Regras de negocio observadas

- Agenda so funciona para cliente com `chatwoot_account_id` resolvido.
- Isolamento de dados por account do Chatwoot.
- Janela e filtros de agenda aplicados no backend.
- Status de appointment controla tanto visual da tabela quanto follow-ups.
- IA nao responde texto quando entra em modo agenda (`reply = null` em check/create), delegando ao calendar-agent.

## 12. Pontos de atencao tecnicos

- Existe variacao de nomenclatura de status em partes legadas (`no_show` vs `noshow`), o que pode impactar consistencia de filtros/relatorios.
- Endpoint cron legado de confirmacoes esta desativado (retorna 410), com novo motor concentrado em `followup-agendado`.
- Dependencia de credencial Google central: indisponibilidade dessa credencial afeta todos os clientes.

## 13. Resumo executivo

A aba de Agenda e uma camada de operacao sobre a tabela `appointments`, com isolamento por `chatwoot_account_id`, autenticacao dual (sessao/token), integracao com Google Calendar para disponibilidade e criacao de eventos, e acoplamento com a IA para conduzir agendamentos de ponta a ponta. O DB garante persistencia e rastreabilidade, enquanto os crons garantem o ciclo de follow-up pre-consulta.
