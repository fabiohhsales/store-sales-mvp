// Gerador do documento de Arquitetura do Sistema de Follow-up ChatSales
const path = require('path');
const fs = require('fs');

// Carrega o módulo docx do caminho global do npm
const docxPath = path.join(process.env.APPDATA || 'C:\\Users\\Pichau\\AppData\\Roaming', 'npm', 'node_modules', 'docx');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageNumber, PageBreak
} = require(docxPath);

// ── Cores ──
const ACCENT = '1B4B82';      // Azul ChatSales
const ACCENT_LIGHT = 'D6E4F3'; // Fundo cabeçalho tabela
const WARN = 'FFF3CD';          // Amarelo alerta
const WARN_BORDER = 'FFC107';
const SUCCESS_BG = 'D4EDDA';   // Verde "já existe"
const GRAY = 'F5F5F5';
const BORDER_COLOR = 'CCCCCC';

// ── Medidas A4 (DXA) ──
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1134; // ~2cm
const CONTENT_W = PAGE_W - MARGIN * 2; // ~9638

const border = (color = BORDER_COLOR) => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color = BORDER_COLOR) => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, bold: true, size: 34, font: 'Arial', color: ACCENT })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Arial', color: '333333' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, font: 'Arial', color: '555555' })],
  });
}

function p(runs, spacing = { before: 80, after: 80 }) {
  const children = typeof runs === 'string'
    ? [new TextRun({ text: runs, size: 22, font: 'Arial' })]
    : runs;
  return new Paragraph({ children, spacing });
}

function bullet(text, bold = false) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: 'Arial', bold })],
  });
}

function code(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 500 },
    children: [new TextRun({ text, size: 18, font: 'Courier New', color: '2D2D2D' })],
    shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
  });
}

function note(text, bgColor = WARN) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 300, right: 300 },
    shading: { fill: bgColor, type: ShadingType.CLEAR },
    children: [
      new TextRun({ text: '⚠️  ', size: 22, font: 'Arial', bold: true }),
      new TextRun({ text, size: 22, font: 'Arial' }),
    ],
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } },
    children: [],
  });
}

function headerRow(cells, widths) {
  return new TableRow({
    tableHeader: true,
    children: cells.map((text, i) =>
      new TableCell({
        borders: borders(ACCENT),
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: ACCENT, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })],
        })],
      })
    ),
  });
}

function dataRow(cells, widths, bg = 'FFFFFF') {
  return new TableRow({
    children: cells.map((text, i) =>
      new TableCell({
        borders: borders(),
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: Array.isArray(text)
          ? text
          : [new Paragraph({ children: [new TextRun({ text: String(text), size: 20, font: 'Arial' })] })],
      })
    ),
  });
}

function table(headers, rows, widths, zebraStart = 'FFFFFF') {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      headerRow(headers, widths),
      ...rows.map((row, i) => dataRow(row, widths, i % 2 === 0 ? zebraStart : GRAY)),
    ],
  });
}

// ────────────────────────────────────────────────
// DOCUMENTO
// ────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, font: 'Arial', color: ACCENT },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: '333333' },
        paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: '555555' },
        paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 2 } },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'ChatSales — Arquitetura de Follow-up', size: 18, font: 'Arial', color: '888888' }),
                new TextRun({ text: '\t26 de março de 2026', size: 18, font: 'Arial', color: '888888' }),
              ],
              tabStops: [{ type: 'right', position: 9360 }],
              border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Página ', size: 18, font: 'Arial', color: '888888' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '888888' }),
                new TextRun({ text: ' de ', size: 18, font: 'Arial', color: '888888' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: 'Arial', color: '888888' }),
              ],
              border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } },
            }),
          ],
        }),
      },
      children: [

        // ── CAPA ──
        new Paragraph({ spacing: { before: 1200 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 120 },
          children: [new TextRun({ text: 'ChatSales', size: 56, bold: true, font: 'Arial', color: ACCENT })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 480 },
          children: [new TextRun({ text: 'Arquitetura de Solução — Sistema de Follow-up de Cadência', size: 30, font: 'Arial', color: '555555' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'Versão 1.0  ·  26 de março de 2026', size: 22, font: 'Arial', color: '888888' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Especialista de Produto ChatSales', size: 22, font: 'Arial', color: '888888' })],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 1. INVENTÁRIO DO QUE JÁ EXISTE ──
        h1('1. Inventário — O que já existe e é aproveitável'),
        p('Antes de especificar o que construir, mapeamos o código existente para maximizar reuso:'),
        new Paragraph({ spacing: { before: 160, after: 120 }, children: [] }),

        table(
          ['Componente', 'Arquivo', 'Status'],
          [
            ['sendTextMessage() — envio via Evolution API', 'src/lib/api/evolution.ts', '✅ Pronto'],
            ['Cron endpoint protegido por CRON_SECRET', '/api/cron/confirmacoes/', '✅ Pronto'],
            ['Tabela followup_logs (log por step)', 'usado em confirmations.ts', '✅ Pronto'],
            ['Labels por conversa (text[])', 'conversations.labels via dispatcher', '✅ Pronto'],
            ['IA seta labels em toda resposta', 'labels_next no AgentOutputSchema', '✅ Pronto — ex: etapa_triagem'],
            ['detected_intent por mensagem', 'debug.detected_intent', '✅ Pronto'],
            ['conversations.followup_cadence', 'campo na tabela conversations', '✅ Existe — não usado ainda'],
            ['last_incoming_at / last_outgoing_at', 'atualizado pelo dispatcher', '✅ Chave p/ detectar estágio'],
            ['Follow-up de agendado (24h + lembrete + no-show)', 'confirmations.ts', '✅ Pronto — mas limitado a 2 steps'],
          ],
          [4000, 3200, 2438],
        ),

        new Paragraph({ spacing: { before: 240 }, children: [] }),

        // ── 2. DETECÇÃO DE ESTÁGIO ──
        h1('2. Detecção de Estágio do Lead'),
        p('A detecção correta do estágio é o coração do sistema. O sinal mais confiável é a combinação de last_incoming_at e last_outgoing_at — não apenas a label, que pode estar desatualizada.'),
        new Paragraph({ spacing: { before: 160 }, children: [] }),

        h3('Regras de Detecção'),
        code('LEAD'),
        code('  conversations.status IN (\'pending\', \'open\')'),
        code('  AND conversations.last_outgoing_at IS NOT NULL   ← bot já respondeu'),
        code('  AND conversations.last_incoming_at < conversations.last_outgoing_at  ← lead não respondeu depois'),
        code('  AND NÃO existe appointment.status = \'scheduled\' para a conversation'),
        new Paragraph({ spacing: { before: 100 }, children: [] }),
        code('EM ATENDIMENTO'),
        code('  conversations.status = \'open\''),
        code('  AND conversations.last_incoming_at > conversations.last_outgoing_at  ← lead respondeu'),
        code('  AND NÃO existe appointment.status = \'scheduled\''),
        new Paragraph({ spacing: { before: 100 }, children: [] }),
        code('AGENDADO'),
        code('  EXISTS appointment WHERE conversation_id = conversations.id'),
        code('    AND appointment.status = \'scheduled\''),
        code('    AND appointment.start_at > NOW()'),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // ── 3. NOVA TABELA ──
        h1('3. Nova Tabela Necessária — followup_cadence_steps'),
        p('A tabela existente followup_logs registra o que foi enviado, mas não é adequada para controle de deduplicação por step. É necessária uma nova tabela:'),
        new Paragraph({ spacing: { before: 120 }, children: [] }),

        code('CREATE TABLE followup_cadence_steps ('),
        code('  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),'),
        code('  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,'),
        code('  cadence_type    text NOT NULL,  -- \'lead\' | \'atendimento\' | \'agendado\''),
        code('  step_key        text NOT NULL,  -- \'D+1\' | \'D+2\' | \'D-24h\' | \'D-5min\' etc'),
        code('  sent_at         timestamptz NOT NULL DEFAULT now(),'),
        code('  message_sent    text,'),
        code('  UNIQUE (conversation_id, cadence_type, step_key)'),
        code(');'),
        new Paragraph({ spacing: { before: 120 }, children: [] }),
        note('A constraint UNIQUE (conversation_id, cadence_type, step_key) resolve idempotência: se o cron rodar 2x na mesma hora, o segundo INSERT falha silenciosamente sem duplicar o envio.'),

        new Paragraph({ children: [new PageBreak()] }),

        // ── 4. CADÊNCIAS ──
        h1('4. As Três Cadências de Follow-up'),

        // 4.1 Lead
        h2('4.1  Cadência Lead'),
        p('Lead enviou mensagem, o bot respondeu, mas o lead NÃO respondeu à primeira mensagem da IA.'),
        new Paragraph({ spacing: { before: 160 }, children: [] }),

        table(
          ['Step', 'Referência (last_outgoing_at)', 'Janela de detecção', 'Horário'],
          [
            ['D+1', '~24h atrás', '23h – 25h atrás', 'Horário comercial (8h–17h SP)'],
            ['D+2', '~48h atrás', '47h – 49h atrás', 'Horário comercial'],
            ['D+3', '~72h atrás', '71h – 73h atrás', 'Horário comercial'],
            ['D+5', '~120h atrás', '119h – 121h atrás', 'Horário comercial'],
            ['D+7', '~168h atrás', '167h – 169h atrás', 'Horário comercial'],
          ],
          [1400, 2800, 2400, 2938],
        ),
        new Paragraph({ spacing: { before: 120 }, children: [] }),

        h3('Novos campos em panel_bot_config'),
        code('followup_lead_enabled   boolean DEFAULT false'),
        code('msg_lead_d1, msg_lead_d2, msg_lead_d3, msg_lead_d5, msg_lead_d7   text'),
        new Paragraph({ spacing: { before: 120 }, children: [] }),

        h3('Condição de saída'),
        bullet('Se last_incoming_at > last_outgoing_at → lead respondeu → sai do funil Lead, entra em Em Atendimento'),
        bullet('Após D+7 sem resposta → definir tratamento (encerrar / escalar) — ver seção 6'),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // 4.2 Em Atendimento
        h2('4.2  Cadência Em Atendimento'),
        p('Lead engajou (respondeu à IA), conversa está aberta, mas NÃO agendou.'),
        new Paragraph({ spacing: { before: 160 }, children: [] }),

        table(
          ['Step', 'Referência (last_incoming_at)', 'Janela de detecção', 'Horário'],
          [
            ['D+1', '~24h atrás', '23h – 25h atrás', 'Horário comercial'],
            ['D+2', '~48h atrás', '47h – 49h atrás', 'Horário comercial'],
            ['D+4', '~96h atrás', '95h – 97h atrás', 'Horário comercial'],
            ['D+7', '~168h atrás', '167h – 169h atrás', 'Horário comercial'],
            ['D+10', '~240h atrás', '239h – 241h atrás', 'Horário comercial'],
          ],
          [1400, 2800, 2400, 2938],
        ),
        new Paragraph({ spacing: { before: 120 }, children: [] }),

        note('Ponto de decisão: O sinal de referência é last_incoming_at (reset quando o lead envia nova mensagem). Confirmar se o comportamento desejado é esse, ou se a referência deve ser conversations.created_at.'),

        h3('Novos campos em panel_bot_config'),
        code('followup_atendimento_enabled   boolean DEFAULT false'),
        code('msg_atendimento_d1, msg_atendimento_d2, msg_atendimento_d4, msg_atendimento_d7, msg_atendimento_d10   text'),
        new Paragraph({ spacing: { before: 120 }, children: [] }),

        h3('Condição de saída'),
        bullet('Appointment criado com status = \'scheduled\' → lead migra para cadência Agendado automaticamente'),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        new Paragraph({ children: [new PageBreak()] }),

        // 4.3 Agendado
        h2('4.3  Cadência Agendado (extensão do confirmations.ts existente)'),
        p('O fluxo já existe parcialmente. Precisa ser reescrito para suportar os 4 steps de precisão e controle por followup_cadence_steps.'),
        new Paragraph({ spacing: { before: 160 }, children: [] }),

        table(
          ['Step', 'Quando disparar', 'Condição extra', 'Cron necessário'],
          [
            ['D-1 (24h antes)', 'start_at entre 23h e 25h à frente', 'Dentro do horário comercial', 'A cada 1 hora'],
            ['D-2 às 12h (meio-dia do dia anterior)', 'start_at entre 36h e 60h à frente + horário SP entre 11h-13h', 'Não enviou D-2 ainda', 'A cada 1 hora'],
            ['-3h', 'start_at entre 2.5h e 3.5h à frente', 'Dentro do horário comercial', 'A cada 1 hora'],
            ['-5min (com meet_link)', 'start_at entre 4min e 8min à frente', 'Inclui variável {meet_link}', '⚠️ A cada 5 minutos'],
          ],
          [1800, 3200, 2200, 2438],
        ),
        new Paragraph({ spacing: { before: 120 }, children: [] }),

        note('O step de -5min com link requer cron a cada 5 minutos. O cron horário atual NÃO é suficiente para cobrir essa janela de 4-8 minutos. É necessário um endpoint separado com schedule mais curto no EasyPanel.'),
        new Paragraph({ spacing: { before: 160 }, children: [] }),

        h3('Meet link — não requer consulta ao Google Calendar em tempo real'),
        p([
          new TextRun({ text: 'O campo ', size: 22, font: 'Arial' }),
          new TextRun({ text: 'appointment.meet_link', size: 22, font: 'Arial', font: 'Courier New', color: '666666' }),
          new TextRun({ text: ' já é armazenado no Supabase no momento do agendamento pelo calendar-agent.ts. O step de -5min lê direto desta tabela — sem chamada ao Google Calendar em tempo real.', size: 22, font: 'Arial' }),
        ]),
        new Paragraph({ spacing: { before: 120 }, children: [] }),

        h3('O que muda no confirmations.ts atual'),
        bullet('Atual: confirmation_sent_at + reminder_sent_at (2 campos na tabela appointments)'),
        bullet('Novo: migrar para followup_cadence_steps com step_keys: agendado_D-1, agendado_D-2, agendado_-3h, agendado_-5min'),
        bullet('Benefício: adicionar novos steps sem alterar o schema da tabela appointments'),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // 4.4 Campos adicionais
        h3('Novos campos em panel_bot_config para Agendado'),
        code('msg_agendado_d2_meio_dia   text'),
        code('msg_agendado_minus3h       text'),
        code('msg_agendado_minus5min     text    -- deve conter {meet_link}'),

        new Paragraph({ children: [new PageBreak()] }),

        // ── 5. INFRAESTRUTURA ──
        h1('5. Infraestrutura de Cron'),

        table(
          ['Endpoint', 'Schedule no EasyPanel', 'Responsabilidade'],
          [
            ['POST /api/cron/followup-cadencia', 'A cada 1 hora', 'Lead D+N + Em Atendimento D+N'],
            ['POST /api/cron/followup-agendado', 'A cada 5 minutos', 'Steps D-1, D-2 às 12h, -3h, -5min'],
            ['POST /api/cron/confirmacoes (existente)', 'A cada 1 hora', 'Manter temporariamente / migrar gradualmente'],
          ],
          [3400, 2400, 3838],
        ),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // ── 6. DIAGRAMA RESUMIDO ──
        h1('6. Fluxo Geral (Visão Simplificada)'),

        code('Lead envia mensagem'),
        code('  → Bot responde (last_outgoing_at setado)'),
        code('  │'),
        code('  ├─ Lead NÃO responde → CADÊNCIA LEAD'),
        code('  │       D+1, D+2, D+3, D+5, D+7'),
        code('  │'),
        code('  └─ Lead responde ─────→ CADÊNCIA EM ATENDIMENTO'),
        code('                                  D+1, D+2, D+4, D+7, D+10'),
        code('                                    │'),
        code('                                    └─ Lead agenda ──→ CADÊNCIA AGENDADO'),
        code('                                                          D-1 (24h, horário comercial)'),
        code('                                                          D-2 às 12h do dia anterior'),
        code('                                                          -3h (horário comercial)'),
        code('                                                          -5min com meet_link  ← cron 5min'),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // ── 7. PONTOS DE DECISÃO ──
        h1('7. Pontos de Decisão — Confirmação Necessária'),
        p('Os itens abaixo precisam ser validados pelo produto antes do handoff para desenvolvimento:'),
        new Paragraph({ spacing: { before: 160 }, children: [] }),

        table(
          ['#', 'Pergunta', 'Impacto'],
          [
            ['1', 'Referência de Em Atendimento: last_incoming_at (reseta com nova mensagem) ou conversations.created_at (fixo)?', 'Comportamento de reset da cadência'],
            ['2', 'Lead que estava em D+3 Lead e respondeu: cadência de Em Atendimento começa do D+1 ou continua do ponto anterior?', 'Lógica de migração entre funis'],
            ['3', 'D-2 às 12h: confirma que é 2 dias antes às 12h (e não "-2 horas")?', 'Interpretação do step'],
            ['4', 'O que encerra o funil Lead? Após D+7 sem resposta: marcar como perdido, encerrar conversa, ou escalar para humano?', 'Status final da conversa'],
            ['5', 'O que encerra o funil Em Atendimento? Após D+10 sem agendamento: encerrar ou escalar?', 'Status final da conversa'],
          ],
          [400, 5800, 3238],
        ),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // ── 8. MENSAGENS-TEMPLATE ──
        h1('8. Proposta de Mensagens-Template'),
        p('Templates sugeridos para cada step. Variáveis disponíveis: {patient_name}, {professional_name}, {business_name}, {service_name}, {date}, {time}, {day_of_week}, {meet_link}.'),
        new Paragraph({ spacing: { before: 160 }, children: [] }),

        h2('8.1  Lead'),
        table(
          ['Step', 'Mensagem sugerida'],
          [
            ['D+1', 'Oi {patient_name}! Vi que você entrou em contato com {business_name} mas não respondemos direito. Como podemos te ajudar?'],
            ['D+2', 'Olá {patient_name}! Ainda disponível para agendar com {professional_name}. Qual horário fica melhor para você?'],
            ['D+3', '{patient_name}, temos horários disponíveis esta semana com {professional_name}. Posso verificar uma data para você?'],
            ['D+5', 'Oi {patient_name}! Uma última tentativa de contato — se tiver interesse, é só responder aqui.'],
            ['D+7', '{patient_name}, estou encerrando o contato por agora. Se precisar de {service_name}, pode nos chamar a qualquer momento.'],
          ],
          [900, 8738],
        ),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        h2('8.2  Em Atendimento'),
        table(
          ['Step', 'Mensagem sugerida'],
          [
            ['D+1', 'Oi {patient_name}! Só passando para saber se posso ajudar com mais alguma dúvida ou para agendarmos o {service_name}?'],
            ['D+2', '{patient_name}, verificar seus horários livres aqui? Temos disponibilidade com {professional_name} ainda esta semana.'],
            ['D+4', 'Oi {patient_name}! Que tal garantirmos sua consulta? Posso checar a agenda de {professional_name} agora mesmo.'],
            ['D+7', '{patient_name}, nossa agenda está quase cheia. Quer que eu verifique o próximo horário disponível?'],
            ['D+10', 'Olá {patient_name}! Finalizando por aqui, mas estamos sempre à disposição. Use nosso WhatsApp quando quiser agendar.'],
          ],
          [900, 8738],
        ),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        h2('8.3  Agendado'),
        table(
          ['Step', 'Mensagem sugerida'],
          [
            ['D-1 (24h antes)', 'Olá {patient_name}! Lembramos da sua consulta com {professional_name} amanhã ({day_of_week}) às {time}. Confirmado?'],
            ['D-2 às 12h', '{patient_name}, sua consulta com {professional_name} está marcada para {day_of_week}, {date} às {time}. Até lá!'],
            ['-3h', 'Oi {patient_name}! Sua consulta é daqui a pouco, às {time}. Qualquer dúvida estamos aqui.'],
            ['-5min (com link)', '{patient_name}, sua consulta começa em 5 minutos! Acesse pelo link: {meet_link}'],
          ],
          [2200, 7438],
        ),
        new Paragraph({ spacing: { before: 200 }, children: [] }),

        divider(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: 'Documento gerado pelo Agente de Produto ChatSales · painel2 · v1.0', size: 18, font: 'Arial', color: '999999', italics: true })],
        }),
      ],
    },
  ],
});

// ── Salvar ──
const outPath = path.join(__dirname, '..', 'followup-arquitetura.docx');
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log('✅ Documento gerado:', outPath);
}).catch((err) => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
