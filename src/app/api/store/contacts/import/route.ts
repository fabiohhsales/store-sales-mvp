import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreSession } from '@/lib/auth/store-session'

function normalizePhone(phone: string): string {
  // Mantém apenas dígitos
  let cleaned = phone.replace(/\D/g, '')
  
  // Se começar com 0, remove
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1)
  }

  // Se não começar com 55 e tiver tamanho de celular brasileiro sem DDI (ex: 31999999999 ou 3188888888)
  if (!cleaned.startsWith('55') && (cleaned.length === 10 || cleaned.length === 11)) {
    cleaned = '55' + cleaned
  }

  return cleaned
}

export async function POST(req: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const accountId = session.accountId
  if (!accountId) {
    return NextResponse.json({ error: 'Nenhuma conta de cliente vinculada ao seu usuário.' }, { status: 400 })
  }

  try {
    const { csvText } = await req.json()
    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'Conteúdo CSV inválido ou ausente.' }, { status: 400 })
    }

    // Dividir linhas e remover vazias
    const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    if (lines.length < 2) {
      return NextResponse.json({ error: 'O CSV precisa conter pelo menos um cabeçalho e uma linha de dados.' }, { status: 400 })
    }

    // Tentar detectar delimitador (vírgula ou ponto e vírgula)
    const headerLine = lines[0]
    const separator = headerLine.includes(';') ? ';' : ','
    const headers = headerLine.split(separator).map(h => h.trim().toLowerCase().replace(/['"]/g, ''))

    // Mapear cabeçalhos para campos suportados
    const nameIdx = headers.findIndex(h => h === 'nome' || h === 'name' || h === 'cliente')
    const phoneIdx = headers.findIndex(h => h === 'telefone' || h === 'phone' || h === 'celular' || h === 'whatsapp')
    const emailIdx = headers.findIndex(h => h === 'email' || h === 'e-mail')
    const cityIdx = headers.findIndex(h => h === 'cidade' || h === 'city')
    const stateIdx = headers.findIndex(h => h === 'estado' || h === 'uf' || h === 'state')
    const tagsIdx = headers.findIndex(h => h === 'tags' || h === 'tags_adicionais')

    if (phoneIdx === -1) {
      return NextResponse.json({ error: 'Coluna de telefone/whatsapp não encontrada no cabeçalho do CSV.' }, { status: 400 })
    }

    const contactsToUpsert: any[] = []
    let skippedCount = 0

    // Processar cada linha de dados
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(separator).map(cell => cell.trim().replace(/^['"]|['"]$/g, ''))
      
      const phoneRaw = row[phoneIdx]
      if (!phoneRaw) {
        skippedCount++
        continue
      }

      const phoneNumber = normalizePhone(phoneRaw)
      if (phoneNumber.length < 10) {
        // Telefone inválido
        skippedCount++
        continue
      }

      const name = nameIdx !== -1 && row[nameIdx] ? row[nameIdx] : `Contato ${phoneNumber.substring(phoneNumber.length - 4)}`
      const email = emailIdx !== -1 && row[emailIdx] ? row[emailIdx] : null
      const city = cityIdx !== -1 && row[cityIdx] ? row[cityIdx] : null
      const state = stateIdx !== -1 && row[stateIdx] ? row[stateIdx] : null
      
      let tags: string[] = []
      if (tagsIdx !== -1 && row[tagsIdx]) {
        tags = row[tagsIdx].split('|').map(t => t.trim()).filter(Boolean)
      }

      const remoteJid = `${phoneNumber}@s.whatsapp.net`

      contactsToUpsert.push({
        account_id: accountId,
        store_id: session.activeStoreId || null,
        name,
        phone_number: phoneNumber,
        remote_jid: remoteJid,
        email,
        city,
        state,
        tags,
        custom_data: { imported_via: 'csv_bulk' },
        updated_at: new Date().toISOString()
      })
    }

    if (contactsToUpsert.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato válido encontrado para importar.' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Realizar upsert em lotes
    const { error: upsertErr } = await supabase
      .from('store_contacts')
      .upsert(contactsToUpsert, { onConflict: 'account_id,phone_number' })

    if (upsertErr) {
      console.error('[Contacts-Import-API] Erro no upsert:', upsertErr)
      return NextResponse.json({ error: 'Erro ao salvar contatos no banco de dados: ' + upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      imported: contactsToUpsert.length,
      skipped: skippedCount
    })
  } catch (error: any) {
    console.error('[Contacts-Import-API] Erro ao processar CSV:', error)
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 })
  }
}
