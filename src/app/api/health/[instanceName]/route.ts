import { NextResponse, type NextRequest } from 'next/server'
import { formatConnectionPayload, reconcileConnectionState } from '@/lib/whatsapp/connection-state'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  const { instanceName } = await params

  try {
    const snapshot = await reconcileConnectionState(instanceName)
    return NextResponse.json(formatConnectionPayload(snapshot))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: message,
        instance: instanceName,
        state: 'error',
        base64: null,
        pairingCode: null,
        connectedPhone: null,
        lastUpdatedAt: new Date().toISOString(),
      },
      { status: 502 }
    )
  }
}
