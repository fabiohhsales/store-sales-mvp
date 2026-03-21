import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { connectInstance } from '@/lib/api/evolution'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const { instanceName } = await params

    const qrcode = await connectInstance(instanceName)

    return NextResponse.json({
      pairingCode: qrcode.pairingCode,
      code: qrcode.code,
      base64: qrcode.base64,
      count: qrcode.count,
    })
  } catch (error) {
    console.error('Erro ao gerar QR code:', error)
    return NextResponse.json(
      { error: 'Erro interno ao gerar QR code' },
      { status: 500 }
    )
  }
}
