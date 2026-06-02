import { z } from 'zod/v4'
import { createAiClient, AI_MODEL_MINI } from '@/lib/ai/client'
import { createAdminClient } from '@/lib/supabase/admin'

const ExtractionSchema = z.object({
  intent: z.enum(['buscar_produto', 'comprar', 'humano', 'reclamar', 'duvida', 'saudacao', 'outro']),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  urgency: z.enum(['low', 'medium', 'high']),
  budget_min: z.number().nullable(),
  budget_max: z.number().nullable(),
  categories: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

/**
 * Runs entity extraction on incoming lead messages using LLM.
 * Saves results to store_message_insights, store_contact_profiles, and store_contact_product_interests.
 */
export async function runStoreEntityExtraction(
  message: any,
  conversation: any,
  storeContext: any
): Promise<void> {
  const supabase = createAdminClient()
  
  try {
    if (message.from_who !== 'lead' || !message.content) {
      return
    }

    // 1. Fetch available product categories for this account to guide classification
    const { data: prodData } = await supabase
      .from('store_products')
      .select('category')
      .eq('account_id', storeContext.clientId)

    const categoriesList = Array.from(new Set((prodData || []).map((p) => p.category).filter(Boolean)))

    // 2. Call OpenAI mini for entity extraction
    const openai = createAiClient()
    const prompt = `Você é um robô de análise de mensagens comerciais para uma loja de móveis e eletrodomésticos.
Analise a mensagem do cliente e extraia os seguintes dados:
- intent: intenção principal da mensagem. Opções:
  - "buscar_produto": pesquisando preços, estoque ou detalhes de produtos.
  - "comprar": intenção explícita de realizar a compra ou pedir link de pagamento.
  - "humano": solicitando falar com atendente humano ou vendedor.
  - "reclamar": reclamações de atraso, erro, etc.
  - "duvida": dúvidas sobre formas de pagamento, entrega, montagem, horário.
  - "saudacao": oi, olá, bom dia.
  - "outro": qualquer outro assunto.
- sentiment: sentimento expresso. Opções: "positive", "negative", "neutral".
- urgency: nível de urgência detectado. Opções: "low", "medium", "high".
- budget_min: menor valor monetário mencionado como orçamento/budget do cliente (em R$), ou null se não houver.
- budget_max: maior valor monetário mencionado como orçamento/budget (em R$), ou null se não houver.
- categories: lista de categorias de interesse encontradas (ex: Sofá, Guarda-roupa, Geladeira, Fogão). Se possível, associe com as seguintes categorias existentes na loja: ${categoriesList.join(', ')}.
- confidence: nível de confiança da extração (0.0 a 1.0).

Mensagem do Cliente:
"${message.content}"

Responda APENAS com o JSON no formato esperado.`

    const completion = await openai.chat.completions.create({
      model: AI_MODEL_MINI,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    })

    const rawContent = completion.choices[0]?.message?.content ?? ''
    let parsed: any
    try {
      parsed = JSON.parse(rawContent)
    } catch {
      console.warn('[Store-Intelligence] Resposta da IA não é JSON válido:', rawContent)
      return
    }

    const validation = ExtractionSchema.safeParse(parsed)
    if (!validation.success) {
      console.warn('[Store-Intelligence] Zod falhou na validação de extração:', validation.error.issues)
      return
    }

    const info = validation.data
    console.log(`[Store-Intelligence] Msg=${message.id} extração concluída:`, info)

    // 3. Save to store_message_insights
    const { error: insErr } = await supabase.from('store_message_insights').insert({
      id: crypto.randomUUID(),
      account_id: storeContext.clientId,
      store_id: storeContext.storeId,
      conversation_id: conversation.id,
      message_id: message.id,
      intent: info.intent,
      entities: { categories: info.categories },
      budget_min: info.budget_min,
      budget_max: info.budget_max,
      urgency: info.urgency,
      sentiment: info.sentiment,
      confidence: info.confidence,
    })

    if (insErr) {
      console.error('[Store-Intelligence] Falha ao inserir insights da mensagem:', insErr.message)
    }

    // 4. Update store_contact_profiles
    const preferredCategories = info.categories.length > 0 ? info.categories : []
    const { data: profile } = await supabase
      .from('store_contact_profiles')
      .select('*')
      .eq('contact_id', conversation.contact_id)
      .eq('account_id', storeContext.clientId)
      .maybeSingle()

    if (profile) {
      const mergedCats = Array.from(new Set([...(profile.preferred_categories || []), ...preferredCategories]))
      await supabase
        .from('store_contact_profiles')
        .update({
          preferred_categories: mergedCats,
          preferred_price_min: info.budget_min || profile.preferred_price_min,
          preferred_price_max: info.budget_max || profile.preferred_price_max,
          last_interest_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
    } else {
      await supabase.from('store_contact_profiles').insert({
        id: crypto.randomUUID(),
        account_id: storeContext.clientId,
        store_id: storeContext.storeId,
        contact_id: conversation.contact_id,
        preferred_categories: preferredCategories,
        preferred_price_min: info.budget_min,
        preferred_price_max: info.budget_max,
        lifecycle_stage: 'lead',
        last_interest_at: new Date().toISOString(),
      })
    }

    // 5. Update or Insert store_contact_product_interests
    for (const cat of preferredCategories) {
      const { data: existingInterest } = await supabase
        .from('store_contact_product_interests')
        .select('*')
        .eq('contact_id', conversation.contact_id)
        .eq('category', cat)
        .maybeSingle()

      if (existingInterest) {
        const score = Number(existingInterest.interest_score || 0) + 10
        await supabase
          .from('store_contact_product_interests')
          .update({
            interest_score: score,
            intent_level: score >= 30 ? 'high' : 'medium',
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existingInterest.id)
      } else {
        await supabase.from('store_contact_product_interests').insert({
          id: crypto.randomUUID(),
          account_id: storeContext.clientId,
          store_id: storeContext.storeId,
          contact_id: conversation.contact_id,
          category: cat,
          interest_score: 10,
          intent_level: 'low',
          source: 'entity_extraction_webhook',
        })
      }
    }
  } catch (err) {
    console.error('[Store-Intelligence] Erro inesperado na extração de entidades:', err)
  }
}
