import { z } from 'zod/v4'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAiClient, AI_MODEL } from '@/lib/ai/client'
import { queryProductChunks } from '@/lib/ai/rag'
import { sanitizeStageLabels } from './stage-labels'
import type { StorePipelineResult, StoreMessage } from '@/types/store'

const AI_PAUSE_MINUTES = 0.5

// Define the structured output format for the Store Agent
export const StoreAgentOutputSchema = z.object({
  reply: z.string().nullable(),
  image_url: z.string().nullable().optional(),
  status_next: z.enum(['pending', 'open', 'resolved']),
  labels_next: z.array(z.string()).min(1),
  lost_reason: z.string().nullable().optional(),
  handoff: z.object({
    needs_human: z.boolean(),
    reason: z.string().nullable(),
  }),
  actions: z.object({
    payment_create: z.object({
      should_create: z.boolean(),
      product_id: z.string().nullable(),
      quantity: z.number().default(1),
    }),
  }),
  debug: z.object({
    detected_intent: z.string(),
    notes: z.string().nullable(),
  }),
})

export type StoreAgentOutput = z.infer<typeof StoreAgentOutputSchema>

export const storeFallbackOutput: StoreAgentOutput = {
  reply: null,
  image_url: null,
  status_next: 'pending',
  labels_next: ['new_lead'],
  lost_reason: null,
  handoff: { needs_human: false, reason: null },
  actions: {
    payment_create: { should_create: false, product_id: null, quantity: 1 },
  },
  debug: { detected_intent: 'outro', notes: 'parse_error' },
}

async function isAiPaused(conversationId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('ai_pauses')
    .select('paused_until')
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (!data) return false
  return new Date(data.paused_until) > new Date()
}

async function setAiPause(conversationId: string, clientId?: string | null): Promise<void> {
  const supabase = createAdminClient()
  const pausedUntil = new Date(Date.now() + AI_PAUSE_MINUTES * 60 * 1000).toISOString()

  await supabase.from('ai_pauses').upsert(
    {
      conversation_id: conversationId,
      paused_until: pausedUntil,
      paused_by: 'bot',
      paused_reason: 'processing',
      updated_at: new Date().toISOString(),
      ...(clientId ? { client_id: clientId } : {}),
    },
    { onConflict: 'conversation_id' }
  )
}

function buildChatMessages(
  history: StoreMessage[],
  systemPrompt: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]

  for (const msg of history) {
    if (msg.from_who === 'lead') {
      const userContent = msg.ai_input_text || msg.content
      if (!userContent) continue
      messages.push({ role: 'user', content: userContent })
    } else if (msg.from_who === 'ai') {
      if (!msg.content) continue
      messages.push({ role: 'assistant', content: msg.content })
    }
  }

  return messages
}

function buildStoreSystemPrompt(
  result: StorePipelineResult,
  ragContext: string,
  allProductsList: string,
  stageLabelsText: string
): string {
  const { storeContext, contact } = result
  const { storeSettings } = storeContext

  const agentName = storeSettings.agent_name
  const tone = storeSettings.tone_of_voice
  const businessRules = JSON.stringify(storeSettings.business_rules ?? {})
  const handoffRules = JSON.stringify(storeSettings.handoff_rules ?? {})
  const patientFirstName = (contact.name ?? 'Cliente').split(' ')[0]

  return `Você é o assistente virtual "${agentName}" de uma loja de móveis e eletrodomésticos.
Você atende no WhatsApp de forma consultiva e cordial.
Cliente: ${patientFirstName}
Data/Hora Atual: ${new Date().toLocaleString('pt-BR')}

REGRAS DE COMUNICAÇÃO:
- Seu tom é: ${tone}.
- Seja humano, direto, use no máximo de 1 a 4 linhas por mensagem.
- Nunca use markdown no texto da resposta (exceto negrito do WhatsApp como *texto* para dar ênfase a preços, nomes de produtos ou ao formatar uma oferta).
- Responda apenas sobre as informações fornecidas no contexto.
- Se o cliente solicitar ou demonstrar interesse em ver fotos, imagens ou o visual de um produto específico, você DEVE identificar o link da imagem correspondente na lista do catálogo abaixo e retornar essa URL no campo "image_url" do JSON de saída.

PRODUTOS RELACIONADOS ENCONTRADOS (RAG):
${ragContext || '- Nenhum produto específico encontrado por similaridade.'}

CATÁLOGO GERAL DE PRODUTOS DISPONÍVEIS (ID, Nome e Imagem):
${allProductsList || '- Nenhum produto cadastrado na base.'}

REGRAS COMERCIAIS / DE NEGÓCIO:
${businessRules}

MÉTODO DE PAGAMENTO (COMO GERAR O PAGAMENTO):
Se o cliente disser explicitamente que deseja comprar ou pagar por um produto do catálogo:
1. Identifique o "product_id" correspondente da lista de produtos acima.
2. Defina no JSON de retorno: actions.payment_create = { "should_create": true, "product_id": "<ID_DO_PRODUTO>", "quantity": 1 }
3. Defina "reply": null (o sistema gerará o link de checkout e enviará para o cliente automaticamente).

Se o preço do produto for a combinar/sob consulta ("price_type" = "on_request" ou valor nulo), ou se o cliente pedir desconto/prazo especial de entrega não listado nas regras de negócio:
- Você deve transferir o atendimento para um humano: defina handoff = { "needs_human": true, "reason": "needs_price_confirmation" } e reply = null (o sistema enviará a mensagem de handoff padrão e colocará na fila humana).

RECONHECER REJEIÇÃO E PERDA (LOST):
Se o cliente expressar explicitamente que não tem interesse, desistiu da compra, comprou em outro lugar, achou caro demais, ou disser "não vou querer", "muito caro", "vou comprar em outro lugar", "cancela", ou similar:
1. Defina "labels_next": ["lost"]
2. Defina "status_next": "resolved"
3. Defina "lost_reason" com um dos seguintes motivos curtos: "preço" (se reclamar do valor), "desistiu" (se desistir sem motivo específico ou outro local), "sem estoque" (se o produto desejado estiver sem estoque), ou "outro" (outros motivos).
4. Elabore uma mensagem gentil e educada de despedida no campo "reply".

REGRAS E ETAPAS DO FUNIL DE VENDAS (MANDATÓRIO: você DEVE atribuir exatamente um deles no campo "labels_next" do JSON de retorno com base no progresso da conversa e nos critérios abaixo):
${stageLabelsText}

REGRAS DE TRANSFÊNCIA (HANDOFF):
Handoff quando o cliente pedir atendente humano, vendedor, ou se as regras de transferência dispararem:
Configurações: ${handoffRules}
Ao transferir: defina handoff.needs_human = true e defina o motivo (reason).

MANDATÓRIO: Responda APENAS com o JSON abaixo, sem formatação markdown:
{
  "reply": "texto de resposta ou null",
  "image_url": "URL da imagem correspondente ou null",
  "status_next": "pending|open|resolved",
  "labels_next": ["new_lead" | "product_discovery" | "product_recommended" | "offer_formatting" | "price_requested" | "quote_requested" | "payment_link_sent" | "negotiation" | "won" | "lost"],
  "lost_reason": "preço|desistiu|sem estoque|outro|null",
  "handoff": { "needs_human": false, "reason": null },
  "actions": {
    "payment_create": { "should_create": false, "product_id": null, "quantity": 1 }
  },
  "debug": { "detected_intent": "buscar_produto|comprar|humano|outro", "notes": null }
}`
}

export async function runStoreAgent(result: StorePipelineResult): Promise<StoreAgentOutput> {
  const { storeContext, conversation, messageHistory } = result

  // 1. Check AI Pause
  const paused = await isAiPaused(conversation.id)
  if (paused) {
    console.log(`[Store-Agent] conv=${conversation.id} está em ai_pause — pulando IA`)
    return { ...storeFallbackOutput, debug: { ...storeFallbackOutput.debug, notes: 'ai_paused' } }
  }

  // Set AI Pause to prevent race condition
  await setAiPause(conversation.id, storeContext.clientId)

  const supabase = createAdminClient()

  // 2. Fetch all products (to build ID mapping list in the prompt)
  const { data: allProducts } = await supabase
    .from('store_products')
    .select('id, name, price_amount, price_type, main_image_url')
    .eq('account_id', storeContext.clientId)
    .eq('store_id', storeContext.storeId)
    .eq('status', 'active')

  const allProductsList = (allProducts || [])
    .map((p) => `- ID: ${p.id} | Nome: ${p.name} | Preço: ${p.price_amount ? `R$ ${p.price_amount}` : 'Sob consulta'} (${p.price_type})${p.main_image_url ? ` | Imagem: ${p.main_image_url}` : ''}`)
    .join('\n')

  // 3. Search RAG context if enabled
  let ragContext = ''
  const latestMessage = messageHistory[messageHistory.length - 1]?.content || ''
  
  if (storeContext.storeSettings.rag_enabled && latestMessage) {
    const matchedChunks = await queryProductChunks(
      storeContext.clientId,
      storeContext.storeId,
      latestMessage,
      5
    )
    
    ragContext = matchedChunks
      .map((c, idx) => `Resultado ${idx + 1} (Similaridade: ${(c.similarity * 100).toFixed(1)}%):\n${c.chunk_text}`)
      .join('\n\n')
  }

  // 4. Fetch custom stages from panel_bot_config to instruct the AI
  const { data: botConfig } = await supabase
    .from('panel_bot_config')
    .select('stage_labels')
    .eq('client_id', storeContext.clientId)
    .maybeSingle()

  const stageLabels = sanitizeStageLabels(botConfig?.stage_labels, 'loja')
  const stageLabelsText = stageLabels
    .map((item) => {
      const cleanSlug = item.slug.replace(/^etapa_/, '')
      let desc = `- ${cleanSlug}: ${item.display_name}`
      const info: string[] = []
      if (item.goal) info.push(`Objetivo: "${item.goal}"`)
      if (item.transition_trigger) info.push(`Gatilho para mover: "${item.transition_trigger}"`)
      if (info.length > 0) {
        desc += ` (${info.join(' | ')})`
      }
      return desc
    })
    .join('\n')

  // 5. Build Chat messages
  const systemPrompt = buildStoreSystemPrompt(result, ragContext, allProductsList, stageLabelsText)
  const chatMessages = buildChatMessages(messageHistory, systemPrompt)

  try {
    const openai = createAiClient()
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: chatMessages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 800,
    })

    const rawContent = completion.choices[0]?.message?.content ?? ''
    
    // Parse output
    let parsed: any
    try {
      // Clean code fences if any
      let cleaned = rawContent.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.warn('[Store-Agent] Erro de JSON na resposta do LLM:', rawContent)
      return storeFallbackOutput
    }

    const validation = StoreAgentOutputSchema.safeParse(parsed)
    if (!validation.success) {
      console.warn('[Store-Agent] Zod falhou na validação do output:', validation.error.issues)
      return storeFallbackOutput
    }

    const output = validation.data
    
    // Safety check: if needs_human is true, force status to open and reply = null
    if (output.handoff.needs_human) {
      return {
        ...output,
        status_next: 'open',
        reply: null,
      }
    }

    return output
  } catch (error) {
    console.error('[Store-Agent] Erro ao chamar OpenAI:', error)
    return storeFallbackOutput
  }
}
