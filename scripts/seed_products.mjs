import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://chatsales-supabase.yvssrw.easypanel.host'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'

const supabase = createClient(supabaseUrl, supabaseKey)

const mockProducts = [
  {
    name: 'Sofá Retrátil e Reclinável 3 Lugares Cama',
    category: 'Estofados',
    price_type: 'fixed',
    price_amount: 1899.00,
    description_short: 'Sofá retrátil e reclinável revestido em tecido Suede macio, espuma D28 e molas ensacadas.',
    description_long: 'O Sofá Retrátil e Reclinável de 3 lugares é ideal para quem busca conforto e modernidade na sala de estar. Estrutura em madeira de eucalipto tratada, espuma de alta resiliência D28, percintas elásticas e molas ensacadas para máximo conforto. Revestimento premium em tecido Suede aveludado.',
    main_image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 12,
    sku: 'SOF-RET-3L',
    pickup_available: true,
    delivery_available: true,
    assembly_included: true,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Cor', value: 'Suede Cinza' },
      { name: 'Lugares', value: '3 Lugares' },
      { name: 'Material', value: 'Eucalipto Tratado e Tecido Suede' },
      { name: 'Dimensões (LxAxP)', value: '2.00m x 1.00m x 1.40m (aberto)' }
    ]
  },
  {
    name: 'Cozinha Modulada Completa 5 Peças com Armários',
    category: 'Cozinhas',
    price_type: 'fixed',
    price_amount: 2499.00,
    description_short: 'Armário de cozinha modular premium com 5 peças, corrediças telescópicas e acabamento amadeirado.',
    description_long: 'A Cozinha Modulada Completa Rede Minas é feita 100% em MDP de alta densidade com acabamento UV resistente a riscos e umidade. Possui corrediças telescópicas para abertura suave das gavetas, puxadores em alumínio bronze, amplo espaço interno e nicho para forno/microondas.',
    main_image_url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 5,
    sku: 'COZ-MOD-5P',
    pickup_available: false,
    delivery_available: true,
    assembly_included: true,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Módulos', value: '5 peças (Aéreo, Paneleiro, Balcão Pia, Nicho Microondas, Aéreo Geladeira)' },
      { name: 'Material', value: 'MDP' },
      { name: 'Acabamento', value: 'Pintura UV Fosco' },
      { name: 'Dimensões (LxAxP)', value: '2.80m x 2.20m x 0.52m' }
    ]
  },
  {
    name: 'Guarda-Roupa Casal 6 Portas com Espelho',
    category: 'Quartos',
    price_type: 'fixed',
    price_amount: 1799.00,
    description_short: 'Roupeiro de casal espaçoso com 6 portas de bater, 3 gavetas internas e espelho central.',
    description_long: 'Guarda-roupa de casal premium ideal para organizar roupas e enxovais. Estrutura reforçada em MDF/MDP, portas de bater com dobradiças metálicas amortecidas, cabideiros em alumínio, gavetas com trilhos metálicos deslizantes e espelho amplo fixado na porta central.',
    main_image_url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 8,
    sku: 'GUA-CAS-6P',
    pickup_available: true,
    delivery_available: true,
    assembly_included: true,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Portas', value: '6 Portas de bater' },
      { name: 'Gavetas', value: '3 Gavetas internas com corrediças telescópicas' },
      { name: 'Material', value: 'MDF e MDP' },
      { name: 'Dimensões (LxAxP)', value: '2.40m x 2.30m x 0.55m' }
    ]
  },
  {
    name: 'Cama Box Casal com Colchão Molas Ensacadas',
    category: 'Colchões',
    price_type: 'fixed',
    price_amount: 1599.00,
    description_short: 'Conjunto Cama Box + Colchão Casal de molas ensacadas individuais, pillow top firme.',
    description_long: 'Garanta noites de sono perfeitas com o Conjunto Box Casal Rede Minas. O colchão conta com sistema de molas ensacadas individuais (que não transmitem movimento ao parceiro), camada pillow top de conforto em espuma D33 selada pelo INMETRO, tecido com tratamento antialérgico e antiácaro.',
    main_image_url: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 15,
    sku: 'CAM-BOX-CAS',
    pickup_available: true,
    delivery_available: true,
    assembly_included: false,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Molas', value: 'Molas Ensacadas Individuais Pocket' },
      { name: 'Densidade Pillow', value: 'D33 Certificada INMETRO' },
      { name: 'Tamanho', value: 'Casal Padrão (1.38m x 1.88m)' },
      { name: 'Altura do Colchão', value: '32cm' }
    ]
  },
  {
    name: 'Mesa de Jantar 6 Cadeiras com Tampo de Vidro',
    category: 'Salas de Jantar',
    price_type: 'fixed',
    price_amount: 1999.00,
    description_short: 'Mesa de jantar de madeira maciça, tampo de vidro temperado e 6 cadeiras estofadas em linho.',
    description_long: 'Mesa de jantar moderna com design escandinavo. Estrutura em madeira maciça de reflorestamento, tampo de MDF com vidro temperado colado de 4mm. Acompanha 6 cadeiras com encosto anatômico e assento estofado em tecido Linho cinza claro de alta resistência.',
    main_image_url: 'https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 4,
    sku: 'MES-JAN-6C',
    pickup_available: false,
    delivery_available: true,
    assembly_included: true,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Cadeiras', value: '6 Cadeiras estofadas' },
      { name: 'Tecido', value: 'Linho Cinza Claro' },
      { name: 'Vidro', value: 'Temperado Serigrafado 4mm' },
      { name: 'Dimensões da Mesa', value: '1.60m x 0.90m x 0.80m' }
    ]
  },
  {
    name: 'Painel Suspenso para TV até 65" com Fita LED',
    category: 'Salas de Estar',
    price_type: 'fixed',
    price_amount: 799.00,
    description_short: 'Painel de TV para fixação na parede, passa-cabos integrado e fita LED embutida.',
    description_long: 'O Painel Suspenso para TV até 65 polegadas une praticidade e sofisticação. Feito em MDF com detalhes frisados em relevo, prateleira superior robusta para objetos decorativos, fita de LED embutida em tom quente para aconchego visual e furação passa-fios integrada.',
    main_image_url: 'https://images.unsplash.com/photo-1593085512500-5d55148d6f0d?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 20,
    sku: 'PAI-TV-65L',
    pickup_available: true,
    delivery_available: true,
    assembly_included: true,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Suporta TV até', value: '65 Polegadas' },
      { name: 'Iluminação', value: 'Fita LED embutida (inclusa)' },
      { name: 'Material', value: 'MDF com frisos' },
      { name: 'Dimensões (LxAxP)', value: '1.80m x 1.50m x 0.32m' }
    ]
  },
  {
    name: 'Poltrona Decorativa Giratória Estofada',
    category: 'Estofados',
    price_type: 'fixed',
    price_amount: 699.00,
    description_short: 'Poltrona giratória decorativa estofada em tecido Bouclé, base em madeira maciça.',
    description_long: 'A Poltrona Giratória Rede Minas é ideal para salas de estar, escritórios ou quartos. Formato anatômico em concha que abraça o corpo, revestimento no moderno tecido Bouclé de toque aconchegante, espuma D26 soft e base giratória em madeira maciça envernizada.',
    main_image_url: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 6,
    sku: 'POL-GIR-BOU',
    pickup_available: true,
    delivery_available: true,
    assembly_included: false,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Tecido', value: 'Bouclé Off-White' },
      { name: 'Base', value: 'Giratória em Madeira Maciça' },
      { name: 'Espuma', value: 'D26 Soft de alta resiliência' },
      { name: 'Dimensões', value: '0.80m x 0.85m x 0.80m' }
    ]
  },
  {
    name: 'Armário Multiuso 2 Portas com Prateleiras',
    category: 'Organizadores',
    price_type: 'fixed',
    price_amount: 499.00,
    description_short: 'Armário multiuso vertical com 2 portas e 5 divisórias internas espaçosas.',
    description_long: 'Armário multiuso perfeito para lavanderias, escritórios ou quartos de despejo. Estrutura em MDP com revestimento em BP resistente a riscos e umidade, duas portas com puxadores cromados e chave de segurança, e 5 prateleiras internas ajustáveis.',
    main_image_url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 18,
    sku: 'ARM-MUL-2P',
    pickup_available: true,
    delivery_available: true,
    assembly_included: true,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Portas', value: '2 Portas com chaves' },
      { name: 'Prateleiras', value: '5 prateleiras internas espaçosas' },
      { name: 'Material', value: 'MDP BP alta durabilidade' },
      { name: 'Dimensões (LxAxP)', value: '0.65m x 1.85m x 0.40m' }
    ]
  },
  {
    name: 'Cômoda de Quarto 5 Gavetas e 1 Porta',
    category: 'Quartos',
    price_type: 'fixed',
    price_amount: 899.00,
    description_short: 'Cômoda roupeiro com 5 gavetas fundas sobre corrediças telescópicas e porta lateral.',
    description_long: 'A Cômoda Rede Minas oferece excelente espaço para dobrados e calçados. Possui 5 gavetas amplas com corrediças telescópicas reforçadas (que abrem totalmente sem cair), porta lateral com prateleira interna para sapatos ou cabides curtos, tampo robusto em MDF de 25mm.',
    main_image_url: 'https://images.unsplash.com/photo-1601084881623-cef5a7de343a?auto=format&fit=crop&w=600&q=80',
    stock_quantity: 9,
    sku: 'COM-QUA-5G',
    pickup_available: true,
    delivery_available: true,
    assembly_included: true,
    delivery_region: 'Leopoldina e Região',
    status: 'active',
    availability_status: 'available',
    attributes: [
      { name: 'Gavetas', value: '5 gavetas sobre corrediças telescópicas' },
      { name: 'Portas', value: '1 porta lateral com prateleira e cabideiro' },
      { name: 'Material', value: 'MDF 25mm (tampo) e MDP' },
      { name: 'Dimensões (LxAxP)', value: '1.20m x 1.10m x 0.48m' }
    ]
  }
]

async function seed() {
  console.log('--- Buscando Contas de Lojas (store_accounts) ---')
  const { data: accounts, error: accErr } = await supabase
    .from('store_accounts')
    .select('id, name')

  if (accErr) {
    console.error('Erro ao buscar contas:', accErr)
    return
  }

  if (!accounts || accounts.length === 0) {
    console.log('Nenhuma conta encontrada na tabela store_accounts.')
    return
  }

  console.log(`Contas encontradas: ${accounts.length}`)

  // 1. Garantir que cada conta tenha pelo menos uma loja (store_stores)
  console.log('\n--- Verificando e criando lojas se necessário ---')
  for (const account of accounts) {
    const { data: existingStores, error: checkErr } = await supabase
      .from('store_stores')
      .select('id, name')
      .eq('account_id', account.id)

    if (checkErr) {
      console.error(`Erro ao verificar lojas para conta ${account.name}:`, checkErr)
      continue
    }

    if (!existingStores || existingStores.length === 0) {
      // Determina o nome apropriado para a loja da Rede Minas
      const isRedeMinas = account.name.toLowerCase().includes('fabio') || account.name.toLowerCase().includes('sales')
      const storeName = isRedeMinas ? 'Rede Minas - Leopoldina' : `Loja - ${account.name}`
      const storeSlug = isRedeMinas ? 'rede-minas-leopoldina' : `loja-${account.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

      console.log(`Criando loja "${storeName}" para a conta "${account.name}"...`)
      
      const { data: newStore, error: insertStoreErr } = await supabase
        .from('store_stores')
        .insert({
          id: crypto.randomUUID(),
          account_id: account.id,
          name: storeName,
          slug: storeSlug,
          city: 'Leopoldina',
          state: 'MG',
          address: 'Av. Getúlio Vargas, 120 - Centro',
          default_delivery_region: 'Leopoldina e Região',
          status: 'active',
          metadata: {}
        })
        .select()
        .single()

      if (insertStoreErr) {
        console.error(`Erro ao criar loja para conta ${account.name}:`, insertStoreErr.message)
      } else {
        console.log(`Loja "${newStore.name}" criada com sucesso! ID: ${newStore.id}`)
      }
    } else {
      console.log(`Conta "${account.name}" já possui as lojas: ${existingStores.map(s => s.name).join(', ')}`)
    }
  }

  // 2. Buscar todas as lojas para associar produtos
  console.log('\n--- Buscando Lojas do Banco ---')
  const { data: stores, error: storeErr } = await supabase
    .from('store_stores')
    .select('id, name, account_id')

  if (storeErr) {
    console.error('Erro ao buscar lojas:', storeErr)
    return
  }

  console.log(`Lojas totais encontradas: ${stores.length}`)

  // 3. Garantir configuração do agente (store_agent_settings) para cada loja
  console.log('\n--- Configurando agentes de IA por loja ---')
  for (const store of stores) {
    const { data: existingSettings, error: setErr } = await supabase
      .from('store_agent_settings')
      .select('id')
      .eq('store_id', store.id)
      .maybeSingle()

    if (setErr) {
      console.error(`Erro ao verificar configurações do agente para loja ${store.name}:`, setErr)
      continue
    }

    if (!existingSettings) {
      console.log(`Configurando agente padrão para loja "${store.name}"...`)
      const { error: insSetErr } = await supabase
        .from('store_agent_settings')
        .insert({
          id: crypto.randomUUID(),
          account_id: store.account_id,
          store_id: store.id,
          agent_name: 'Vendedor Virtual Rede Minas',
          tone_of_voice: 'consultivo, objetivo e muito atencioso com o cliente de Leopoldina',
          auto_reply_enabled: true,
          rag_enabled: true,
          human_handoff_enabled: true,
          fallback_message: 'Desculpe, não consegui entender sua dúvida sobre esse produto. Gostaria que eu te passasse para um vendedor humano?',
          business_rules: {
            "politica_entrega": "Entrega grátis em Leopoldina para compras acima de R$ 500,00. Demais regiões consultar taxas.",
            "politica_montagem": "Montagem inclusa gratuitamente para a maioria dos móveis entregues em Leopoldina e região."
          }
        })

      if (insSetErr) {
        console.error(`Erro ao configurar agente para loja ${store.name}:`, insSetErr.message)
      } else {
        console.log(`Agente configurado com sucesso para a loja "${store.name}".`)
      }
    }
  }

  // 4. Semeando produtos nas lojas
  console.log('\n--- Semeando catálogo de produtos ---')
  for (const store of stores) {
    console.log(`\nSemeando produtos para Loja: "${store.name}" (ID: ${store.id})`)

    // Limpar produtos antigos desta loja para evitar duplicação ou lixo
    const { error: delErr } = await supabase
      .from('store_products')
      .delete()
      .eq('store_id', store.id)

    if (delErr) {
      console.warn(`Aviso: Erro ao limpar produtos anteriores da loja ${store.name}:`, delErr.message)
    }

    let successCount = 0
    let attributeCount = 0

    for (const p of mockProducts) {
      const productId = crypto.randomUUID()
      
      const productRow = {
        id: productId,
        account_id: store.account_id,
        store_id: store.id,
        name: p.name,
        normalized_name: p.name.trim().toLowerCase(),
        category: p.category,
        price_type: p.price_type,
        price_amount: p.price_amount,
        price_currency: 'BRL',
        description_short: p.description_short,
        description_long: p.description_long,
        main_image_url: p.main_image_url,
        stock_quantity: p.stock_quantity,
        sku: p.sku,
        pickup_available: p.pickup_available,
        delivery_available: p.delivery_available,
        assembly_included: p.assembly_included,
        delivery_region: p.delivery_region,
        status: p.status,
        availability_status: p.availability_status,
        source_type: 'manual',
        confidence: 1.0,
        metadata: {
          seeded_at: new Date().toISOString()
        }
      }

      const { error: insErr } = await supabase
        .from('store_products')
        .insert(productRow)

      if (insErr) {
        console.error(`Erro ao inserir produto "${p.name}" na loja ${store.name}:`, insErr.message)
        continue
      }
      
      successCount++

      // Inserir os atributos do produto para visualização rica
      if (p.attributes && p.attributes.length > 0) {
        const attributeRows = p.attributes.map(attr => ({
          id: crypto.randomUUID(),
          account_id: store.account_id,
          product_id: productId,
          attribute_name: attr.name,
          attribute_value: attr.value,
          source: 'manual',
          confidence: 1.0
        }))

        const { error: attrErr } = await supabase
          .from('store_product_attributes')
          .insert(attributeRows)

        if (attrErr) {
          console.error(`Erro ao inserir atributos para "${p.name}":`, attrErr.message)
        } else {
          attributeCount += attributeRows.length
        }
      }
    }

    console.log(`Sucesso! ${successCount} produtos e ${attributeCount} atributos cadastrados na loja "${store.name}".`)
  }
}

seed().catch(console.error)
