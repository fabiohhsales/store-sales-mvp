import { NextResponse, type NextRequest } from 'next/server'
import { connectInstance, getConnectionState } from '@/lib/api/evolution'

// Rota PÚBLICA (sem auth) — para o cliente escanear o QR pelo celular
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  const { instanceName } = await params

  try {
    // Checa se já está conectado
    const connectionState = await getConnectionState(instanceName)
    const state = connectionState.instance?.state || 'close'

    if (state === 'open') {
      return NextResponse.json({ state: 'open', qrcode: null })
    }

    // Gera QR code
    const qrcode = await connectInstance(instanceName)

    return NextResponse.json({
      state: 'waiting_scan',
      qrcode: {
        base64: qrcode.base64,
        pairingCode: qrcode.pairingCode,
      },
    })
  } catch (error) {
    console.error('Erro ao gerar QR público:', error)
    return NextResponse.json(
      { error: 'Instância não encontrada ou erro ao gerar QR code' },
      { status: 404 }
    )
  }
}
