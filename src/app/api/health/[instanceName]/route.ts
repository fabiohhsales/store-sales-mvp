import { NextResponse, type NextRequest } from 'next/server'
import { getConnectionState } from '@/lib/api/evolution'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  const { instanceName } = await params

  try {
    const connectionState = await getConnectionState(instanceName)
    return NextResponse.json({
      instance: instanceName,
      state: connectionState.instance?.state || 'close',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message, instance: instanceName, state: 'error' },
      { status: 502 }
    )
  }
}
