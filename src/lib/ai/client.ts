// Client de IA unificado: usa OpenAI se OPENAI_API_KEY estiver setada, senão Groq.
// Groq é 100% compatível com a SDK da OpenAI — só muda a baseURL.

import OpenAI from 'openai'

export function createAiClient(): OpenAI {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  if (process.env.GROQ_API_KEY) {
    return new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }

  throw new Error('Nenhuma API key de IA configurada. Defina OPENAI_API_KEY ou GROQ_API_KEY.')
}

export const AI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

// Modelo leve para chamadas simples (parse de datas, etc.)
// No Groq usa o mesmo modelo principal. No OpenAI usa gpt-4o-mini para economizar.
export const AI_MODEL_MINI = process.env.OPENAI_API_KEY
  ? (process.env.OPENAI_MODEL_MINI ?? 'gpt-4o-mini')
  : AI_MODEL
