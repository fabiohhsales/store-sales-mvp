-- Migration 060: Adiciona etapa de formatação de oferta ao commercial_stage da loja
ALTER TABLE store_conversations DROP CONSTRAINT IF EXISTS store_conversations_commercial_stage_check;
ALTER TABLE store_conversations ADD CONSTRAINT store_conversations_commercial_stage_check CHECK (commercial_stage IN (
  'new_lead',
  'product_discovery',
  'product_recommended',
  'offer_formatting',
  'price_requested',
  'quote_requested',
  'payment_link_sent',
  'negotiation',
  'won',
  'lost'
));
