import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { connectInstance } from '@/lib/api/evolution'
import { setCachedQrCode } from '@/lib/whatsapp/qrcode-cache'
import { formatConnectionPayload, reconcileConnectionState } from '@/lib/whatsapp/connection-state'

function normalizePhoneNumber(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    const { instanceName } = await params
    const body = await request.json()
    const phoneNumber = normalizePhoneNumber(typeof body?.phoneNumber === 'string' ? body.phoneNumber : '')

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Informe um numero de telefone valido com DDI.' },
        { status: 400 }
      )
    }

    const snapshot = await reconcileConnectionState(instanceName)
    if (snapshot.state === 'open') {
      return NextResponse.json(formatConnectionPayload(snapshot))
    }

    const qrcode = await connectInstance(instanceName, phoneNumber)
    setCachedQrCode(instanceName, {
      base64: qrcode.base64 ?? null,
      pairingCode: qrcode.pairingCode ?? null,
    })

    return NextResponse.json({
      ...formatConnectionPayload({
        ...snapshot,
        state: 'connecting',
      }),
      base64: qrcode.base64 ?? null,
      pairingCode: qrcode.pairingCode ?? null,
      lastUpdatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Erro ao gerar pairing code:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao gerar pairing code' },
      { status: 500 }
    )
  }
}
