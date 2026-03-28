# fup_logicv2

## Objetivo
Documentar a logica de Follow-up V2 para handoff tecnico entre chats/agentes, sem ambiguidade.

## Contexto de negocio
- O cliente pode ter varias etiquetas no Chatwoot.
- Nem toda etiqueta deve impactar follow-ups.
- Apenas etiquetas explicitamente vinculadas devem definir cadencia.
- Exemplo de etiqueta livre: `frio` (nao deve disparar ou alterar follow-up).

## Decisao funcional (fonte da verdade)
1. O vinculo de follow-up e configurado por etiqueta em `stage_labels`.
2. Somente etiquetas com `followup_cadence` definido (`lead`, `atendimento`, `agendado`) influenciam a cadencia.
3. Etiquetas sem vinculo (`null`) sao ignoradas para follow-up.
4. Clientes antigos sem esse mapeamento continuam funcionando por fallback legado.
5. No sync de etiquetas com Chatwoot, preservar o `followup_cadence` ja salvo por `slug`.

## Implementacao realizada

### 1) Tipagem de etiquetas com vinculo de cadencia
Arquivo: `src/types/database.ts`
- `StageLabelConfig` recebeu campo opcional:
  - `followup_cadence?: 'lead' | 'atendimento' | 'agendado' | null`

### 2) Defaults e sanitizacao
Arquivo: `src/lib/bot/stage-labels.ts`
- `DEFAULT_STAGE_LABELS` atualizado com mapeamentos iniciais:
  - `etapa_triagem` -> `lead`
  - `etapa_qualificacao` -> `atendimento`
  - `etapa_agendando` -> `null`
  - `etapa_agendado` -> `agendado`
  - `etapa_confirmado` -> `agendado`
  - `etapa_paciente` -> `atendimento`
  - `etapa_inativo` -> `null`
- `sanitizeStageLabels()` passou a validar/preservar `followup_cadence`.

### 3) UI para configurar vinculo por etiqueta
Arquivo: `src/components/bot-config/stages-labels-section.tsx`
- Adicionado select por etapa:
  - Sem vinculo
  - Lead
  - Em Atendimento
  - Agendado
- Valor salvo no proprio objeto da etapa (`StageLabelConfig`).

### 4) Dispatcher com mapeamento configuravel + fallback
Arquivo: `src/lib/bot/dispatcher.ts`
- `detectFollowupCadence()` agora recebe `botConfig`.
- Primeiro tenta resolver por mapeamento em `stage_labels` (slug -> followup_cadence).
- Se nao houver mapeamento configurado, usa regra hardcoded anterior (fallback).
- `updateConversationRecord()` passou a receber `botConfig` para calcular `followup_cadence` corretamente.

### 5) Cadencia de atendimento com mapeamento configuravel + fallback
Arquivo: `src/lib/followup/atendimento-cadence.ts`
- `isAtendimentoStage()` passou a considerar etiquetas do cliente com `followup_cadence === 'atendimento'`.
- Se cliente nao tiver mapeamento, mantem comportamento legado via sets hardcoded.
- `queryAtendimentoConversations()` agora recebe `botConfig` para aplicar esse filtro.

### 6) Preservacao do vinculo no sync de labels
Arquivo: `src/app/api/bot-config/route.ts`
- No GET, ao puxar labels remotas do Chatwoot:
  - monta mapa `slug -> followup_cadence` da config atual
  - aplica esse valor nas labels remotas sanitizadas
- Evita zerar/overwritar vinculos ao sincronizar.

## Comportamento esperado

### Cenario A: etiqueta vinculada
- Entrada: conversa com label `etapa_agendado` mapeada para `agendado`.
- Esperado: `conversations.followup_cadence = 'agendado'`.

### Cenario B: etiqueta livre
- Entrada: conversa com label `frio` (sem mapeamento em `stage_labels`).
- Esperado: nao altera decisao de cadencia por mapeamento; etiqueta e ignorada para follow-up.

### Cenario C: cliente legado
- Entrada: cliente sem `followup_cadence` configurado em nenhuma etapa.
- Esperado: segue regras hardcoded antigas, sem regressao.

## Nao-objetivos (nesta fase)
- Nao tornar templates de mensagem totalmente dinamicos por etiqueta.
- Nao criar steps customizados (D+1, D+3, etc.) por etapa.
- Nao mudar a estrutura de cadencias principais (lead/atendimento/agendado).

## Riscos mapeados e mitigacao
- Risco: perda de vinculo no sync com Chatwoot.
  - Mitigacao: merge por slug preservando `followup_cadence` no GET de bot-config.
- Risco: quebrar clientes antigos.
  - Mitigacao: fallback legado no dispatcher e atendimento-cadence.

## Checklist de validacao
- [ ] Salvar config com vinculos por etapa e confirmar persistencia em `panel_bot_config.stage_labels`.
- [ ] Simular conversa com etiqueta vinculada e validar `conversations.followup_cadence`.
- [ ] Simular etiqueta livre (`frio`) e validar que nao afeta follow-up.
- [ ] Validar cliente antigo sem mapeamento e confirmar comportamento legado.

## Prompt pronto para outro chat/agente
Use este arquivo como fonte de verdade: `fup_logicv2.md`.

Tarefa:
1. Leia o arquivo inteiro.
2. Resuma em 5 bullets as regras obrigatorias.
3. Liste os riscos de regressao antes de qualquer edicao.
4. Se houver mudanca de codigo, mantenha fallback legado.
5. Entregue diff por arquivo + checklist de validacao executado.

## Arquivos-chave
- `src/types/database.ts`
- `src/lib/bot/stage-labels.ts`
- `src/components/bot-config/stages-labels-section.tsx`
- `src/lib/bot/dispatcher.ts`
- `src/lib/followup/atendimento-cadence.ts`
- `src/app/api/bot-config/route.ts`
