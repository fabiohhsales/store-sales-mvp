import { createAdminClient } from '@/lib/supabase/admin'

export interface CheckoutSession {
  id: string
  url: string
  provider: 'stripe' | 'abacatepay' | 'mock'
}

/**
 * Creates a checkout payment link for a given order amount.
 * Supports Stripe, AbacatePay, and falls back to a developer Mock mode if no keys are set.
 */
export async function createCheckoutSession(
  clientId: string,
  storeId: string,
  orderId: string,
  totalAmount: number,
  description: string
): Promise<CheckoutSession> {
  const supabase = createAdminClient()

  // Fetch active client-specific credentials
  const { data: integrations } = await supabase
    .from('store_payment_integrations')
    .select('provider, api_key')
    .eq('account_id', clientId)
    .eq('is_active', true)

  const stripeIntegration = integrations?.find((i) => i.provider === 'stripe')
  const abacateIntegration = integrations?.find((i) => i.provider === 'abacatepay')

  const stripeKey = stripeIntegration?.api_key || process.env.STRIPE_API_KEY
  const abacateKey = abacateIntegration?.api_key || process.env.ABACATEPAY_API_KEY
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

  // 1. AbacatePay Integration
  if (abacateKey) {
    try {
      console.log(`[Payment] Criando checkout AbacatePay para order=${orderId} valor=${totalAmount}`)
      const response = await fetch('https://api.abacatepay.com/v1/billing/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${abacateKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frequency: 'ONE_TIME',
          methods: ['PIX'],
          products: [
            {
              externalId: orderId,
              name: description,
              quantity: 1,
              price: Math.round(totalAmount * 100), // Em centavos
            },
          ],
          returnUrl: `${appUrl}/store/orders/${orderId}`,
          completionUrl: `${appUrl}/store/orders/${orderId}`,
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Erro AbacatePay: ${response.status} - ${errText}`)
      }

      const resJson = await response.json()
      return {
        id: resJson.data.id,
        url: resJson.data.url,
        provider: 'abacatepay',
      }
    } catch (error) {
      console.error('[Payment] Falha no checkout AbacatePay:', error)
      throw error
    }
  }

  // 2. Stripe Integration
  if (stripeKey) {
    try {
      console.log(`[Payment] Criando checkout Stripe para order=${orderId} valor=${totalAmount}`)
      const params = new URLSearchParams()
      params.append('payment_method_types[0]', 'card')
      params.append('payment_method_types[1]', 'boleto')
      params.append('line_items[0][price_data][currency]', 'brl')
      params.append('line_items[0][price_data][product_data][name]', description)
      params.append('line_items[0][price_data][unit_amount]', String(Math.round(totalAmount * 100))) // Em centavos
      params.append('line_items[0][quantity]', '1')
      params.append('mode', 'payment')
      params.append('success_url', `${appUrl}/store/orders/${orderId}?status=success`)
      params.append('cancel_url', `${appUrl}/store/orders/${orderId}?status=cancelled`)
      params.append('client_reference_id', orderId)

      const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Erro Stripe: ${response.status} - ${errText}`)
      }

      const resJson = await response.json()
      return {
        id: resJson.id,
        url: resJson.url,
        provider: 'stripe',
      }
    } catch (error) {
      console.error('[Payment] Falha no checkout Stripe:', error)
      throw error
    }
  }

  // 3. Fallback: Mock Integration for Development Sandbox
  console.log(`[Payment-Mock] Nenhuma chave de API configurada. Gerando checkout simulado para order=${orderId}`)
  const mockId = `mock_sess_${crypto.randomUUID().slice(0, 8)}`
  return {
    id: mockId,
    url: `${appUrl}/api/webhooks/payments?provider=mock&id=${mockId}&order_id=${orderId}`,
    provider: 'mock',
  }
}
