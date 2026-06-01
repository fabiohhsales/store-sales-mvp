-- Migration 048: Função de Busca de Fragmentos de Produtos por Similaridade (RAG)
-- Cria função match_product_chunks para busca vetorial no Supabase

CREATE OR REPLACE FUNCTION match_product_chunks(
  p_client_id uuid,
  p_store_id uuid,
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  chunk_id uuid,
  product_id uuid,
  chunk_text text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    pe.chunk_id,
    pe.product_id,
    pc.chunk_text,
    (1 - (pe.embedding <=> query_embedding))::float AS similarity
  FROM product_embeddings pe
  JOIN product_chunks pc ON pe.chunk_id = pc.id
  WHERE pe.client_id = p_client_id
    AND pe.store_id = p_store_id
    AND (1 - (pe.embedding <=> query_embedding)) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
$$;
