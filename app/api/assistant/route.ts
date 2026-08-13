import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { Stock } from '@/types/stock';
import type { Indicator } from '@/types/indicator';

interface ChatMessage { role: 'user' | 'assistant'; content: string }

const MAX_HISTORY = 20;

function fmtStockRow(s: Stock): string {
  const dd = s.maxDrawdown1y !== null ? `${s.maxDrawdown1y.toFixed(1)}%` : 'N/A';
  const beta = s.beta !== null ? s.beta.toFixed(2) : 'N/A';
  return `${s.ticker} | ${s.name} | ${s.sector} | ${s.currentPrice.toFixed(2)} ${s.currency} | target ${s.priceTarget.toFixed(2)} | upside ${s.upside}% | ${s.recommendation} | beta ${beta} | maxDD1y ${dd} | día ${s.change24h}% | 30d ${s.change30d ?? 'N/A'}% | 60d ${s.change60d ?? 'N/A'}%`;
}

function fmtIndicatorRow(i: Indicator): string {
  return `${i.label}: ${i.value}${i.changePercent !== null ? ` (${i.changePercent >= 0 ? '+' : ''}${i.changePercent}%)` : ''}`;
}

async function buildMarketContext(requestUrl: string): Promise<string> {
  try {
    const [stocksRes, indicatorsRes] = await Promise.all([
      fetch(new URL('/api/stocks', requestUrl)),
      fetch(new URL('/api/indicators', requestUrl)),
    ]);

    const stocks: Stock[] = stocksRes.ok ? await stocksRes.json() : [];
    const indicators: Indicator[] = indicatorsRes.ok ? await indicatorsRes.json() : [];

    const us = stocks.filter(s => s.market === 'US');
    const cl = stocks.filter(s => s.market === 'CL');

    return `## Indicadores macro
${indicators.map(fmtIndicatorRow).join('\n') || 'No disponibles.'}

## Acciones EE.UU. (${us.length})
${us.map(fmtStockRow).join('\n') || 'No disponibles.'}

## Acciones Chile / IPSA (${cl.length})
${cl.map(fmtStockRow).join('\n') || 'No disponibles.'}`;
  } catch {
    return 'No se pudo cargar el estado actual del mercado.';
  }
}

const SYSTEM_PROMPT = `Eres el asistente financiero integrado en StockVision, un dashboard de acciones de EE.UU. y Chile (IPSA).

Reglas:
- Responde siempre en español, de forma clara y concisa (idealmente menos de 200 palabras, salvo que te pidan más detalle).
- Usa el bloque de datos de mercado provisto (precios, targets de analistas, recomendaciones, beta, max drawdown, variación 30D/60D, indicadores macro) para fundamentar respuestas sobre las acciones del dashboard.
- Tienes una herramienta de búsqueda web: úsala cuando te pidan información actual que no esté en el contexto de mercado (noticias del día, eventos recientes, contexto macro/regulatorio, etc.). No te niegues a buscar — intenta primero.
- Si te preguntan por una acción del dashboard, cita ticker, precio actual, upside y recomendación de analistas, y menciona algún dato de riesgo (beta o drawdown) si aporta.
- Si después de buscar sigues sin un dato, dilo explícitamente en vez de inventarlo.
- Puedes usar Markdown simple (negritas, listas). No uses LaTeX.
- Cierra respuestas de análisis de una acción específica con una nota breve de que es información, no asesoría financiera.`;

const MAX_TOOL_CONTINUATIONS = 3;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.includes('sk-ant-...')) {
      return NextResponse.json(
        { error: 'Agrega ANTHROPIC_API_KEY en .env.local para habilitar el asistente.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: 'No se recibió ningún mensaje.' }, { status: 400 });
    }

    const recentMessages = messages.slice(-MAX_HISTORY);
    const marketContext = await buildMarketContext(req.url);

    const client = new Anthropic({ apiKey });
    const system = `${SYSTEM_PROMPT}\n\n# Datos actuales del mercado\n${marketContext}`;
    let conversation: Anthropic.MessageParam[] = recentMessages.map(m => ({ role: m.role, content: m.content }));

    let msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      messages: conversation,
    });

    let continuations = 0;
    while (msg.stop_reason === 'pause_turn' && continuations < MAX_TOOL_CONTINUATIONS) {
      conversation = [...conversation, { role: 'assistant', content: msg.content }];
      msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system,
        tools: [{ type: 'web_search_20260209', name: 'web_search' }],
        messages: conversation,
      });
      continuations++;
    }

    const reply = msg.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n\n') || 'No se pudo generar una respuesta.';

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Assistant error:', error);
    return NextResponse.json(
      { error: 'No se pudo contactar al asistente. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
