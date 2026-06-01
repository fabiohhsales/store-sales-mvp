import { z } from 'zod/v4'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAiClient, AI_MODEL } from '@/lib/ai/client'
import { queryProductChunks } from '@/lib/ai/rag'
import { resolveAgentInputText } from './multimodal'
import type { StorePipelineResult } from '@/types/store'
import type { BotMessage } from '@/types/bot'

const AI_PAUSE_MINUTES = 0.5

// Define the structured output format for the Store Agent
export const StoreAgentOutputSchema = z.object({
  reply: z.string().nullable(),
  status_next: z.enum(['pending', 'open', 'resolved']),
  labels_next: z.array(z.string()).min(1),
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
  status_next: 'pending',
  labels_next: ['etapa_triagem'],
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
  history: BotMessage[],
  systemPrompt: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]

  for (const msg of history) {
    if (msg.from_who === 'lead') {
      const userContent = resolveAgentInputText(msg)
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
  allProductsList: string
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
- Nunca use markdown no texto da resposta.
- Responda apenas sobre as informações fornecidas no contexto.

PRODUTOS RELACIONADOS ENCONTRADOS (RAG):
${ragContext || '- Nenhum produto específico encontrado por similaridade.'}

CATÁLOGO GERAL DE PRODUTOS DISPONÍVEIS (ID e Nome):
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

REGRAS DE TRANSFÊNCIA (HANDOFF):
Handoff quando o cliente pedir atendente humano, vendedor, ou se as regras de transferência dispararem:
Configurações: ${handoffRules}
Ao transferir: defina handoff.needs_human = true e defina o motivo (reason).

MANDATÓRIO: Responda APENAS com o JSON abaixo, sem formatação markdown:
{
  "reply": "texto de resposta ou null",
  "status_next": "pending|open|resolved",
  "labels_next": ["etapa_triagem"],
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
    .from('products')
    .select('id, name, price_amount, price_type')
    .eq('client_id', storeContext.clientId)
    .eq('store_id', storeContext.storeId)
    .eq('status', 'active')

  const allProductsList = (allProducts || [])
    .map((p) => `- ID: ${p.id} | Nome: ${p.name} | Preço: ${p.price_amount ? `R$ ${p.price_amount}` : 'Sob consulta'} (${p.price_type})`)
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

  // 4. Build Chat messages
  const systemPrompt = buildStoreSystemPrompt(result, ragContext, allProductsList)
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
