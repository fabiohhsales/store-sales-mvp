import { NextResponse, type NextRequest } from 'next/server'
import { connectInstance } from '@/lib/api/evolution'
import { clearCachedQrCode, getCachedQrCode, setCachedQrCode } from '@/lib/whatsapp/qrcode-cache'
import { formatConnectionPayload, reconcileConnectionState } from '@/lib/whatsapp/connection-state'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  const { instanceName } = await params

  try {
    const snapshot = await reconcileConnectionState(instanceName)
    if (snapshot.state === 'open') {
      clearCachedQrCode(instanceName)
      return NextResponse.json(formatConnectionPayload(snapshot))
    }

    const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1'
    const cached = !forceRefresh ? getCachedQrCode(instanceName) : null
    const qrCode = cached ?? setCachedQrCode(instanceName, await generateQrPayload(instanceName))

    return NextResponse.json({
      ...formatConnectionPayload({
        ...snapshot,
        state: snapshot.state === 'error' ? 'connecting' : snapshot.state,
      }),
      base64: qrCode.base64,
      pairingCode: qrCode.pairingCode,
      lastUpdatedAt: new Date(qrCode.createdAt).toISOString(),
    })
  } catch (error) {
    console.error('Erro ao gerar QR publico:', error)
    return NextResponse.json(
      { error: 'Instancia nao encontrada ou erro ao gerar QR code' },
      { status: 404 }
    )
  }
}

async function generateQrPayload(instanceName: string) {
  const qrcode = await connectInstance(instanceName)
  return {
    base64: qrcode.base64 ?? null,
    pairingCode: qrcode.pairingCode ?? null,
  }
}
