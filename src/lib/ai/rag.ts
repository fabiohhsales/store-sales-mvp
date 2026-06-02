import { createAiClient } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

const EMBEDDING_MODEL = 'text-embedding-3-small'

export interface MatchedChunk {
  chunk_id: string
  product_id: string
  chunk_text: string
  similarity: number
}

/**
 * Generates vector embedding (1536 dim) for the given input text using OpenAI.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const openai = createAiClient()
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.replace(/\n/g, ' '),
    })
    return response.data[0].embedding
  } catch (error) {
    console.error('[RAG] Falha ao gerar embedding:', error)
    throw error
  }
}

/**
 * Queries Supabase using match_store_product_chunks RPC to find similar product chunks.
 */
export async function queryProductChunks(
  accountId: string,
  storeId: string,
  queryText: string,
  topK = 5,
  threshold = 0.35
): Promise<MatchedChunk[]> {
  try {
    const queryEmbedding = await generateEmbedding(queryText)
    const supabase = createAdminClient()

    const { data, error } = await supabase.rpc('match_store_product_chunks', {
      p_account_id: accountId,
      p_store_id: storeId,
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: topK,
    })

    if (error) {
      throw error
    }

    return (data || []) as MatchedChunk[]
  } catch (error) {
    console.error('[RAG] Falha ao buscar chunks de produtos:', error)
    return []
  }
}

/**
 * Splits raw text into smaller chunks.
 */
function chunkText(text: string, size = 800, overlap = 150): string[] {
  const chunks: string[] = []
  let index = 0

  while (index < text.length) {
    const end = Math.min(index + size, text.length)
    chunks.push(text.slice(index, end))
    if (end === text.length) break
    index += size - overlap
  }

  return chunks
}

/**
 * Chunks, embeds, and saves a product document into Supabase.
 */
export async function ingestProductDocument(
  accountId: string,
  storeId: string,
  productId: string,
  rawText: string,
  title?: string
): Promise<void> {
  const supabase = createAdminClient()

  // 1. Save Document record
  const { data: doc, error: docError } = await supabase
    .from('store_product_documents')
    .insert({
      id: crypto.randomUUID(),
      account_id: accountId,
      store_id: storeId,
      product_id: productId,
      title: title || 'Descrição de Produto',
      raw_text: rawText,
      metadata: {},
    })
    .select()
    .single()

  if (docError) {
    throw new Error(`Erro ao salvar documento do produto: ${docError.message}`)
  }

  // 2. Chunk text
  const textChunks = chunkText(rawText)
  
  for (let i = 0; i < textChunks.length; i++) {
    const chunkTextStr = textChunks[i]
    
    // Save Chunk record
    const { data: chunk, error: chunkError } = await supabase
      .from('store_product_chunks')
      .insert({
        id: crypto.randomUUID(),
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        document_id: doc.id,
        chunk_text: chunkTextStr,
        chunk_index: i,
      })
      .select()
      .single()

    if (chunkError) {
      console.error(`[RAG] Erro ao salvar chunk ${i} do produto ${productId}:`, chunkError.message)
      continue
    }

    // 3. Generate and save Embedding
    try {
      const embedding = await generateEmbedding(chunkTextStr)
      const { error: embError } = await supabase
        .from('store_product_embeddings')
        .insert({
          id: crypto.randomUUID(),
          account_id: accountId,
          store_id: storeId,
          product_id: productId,
          chunk_id: chunk.id,
          embedding,
          model: EMBEDDING_MODEL,
        })
      
      if (embError) {
        console.error(`[RAG] Erro ao salvar embedding do chunk ${chunk.id}:`, embError.message)
      }
    } catch (embGenError) {
      console.error(`[RAG] Falha ao criar embedding para o chunk ${chunk.id}:`, embGenError)
    }
  }
}
