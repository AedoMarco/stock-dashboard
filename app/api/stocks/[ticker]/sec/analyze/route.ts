import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { TICKER_TO_CIK } from '../route';

interface CacheEntry { analysis: string; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchFilingText(cikNum: string, accession: string, primaryDoc: string): Promise<string> {
  const accessionFormatted = accession.replace(/-/g, '');
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionFormatted}/${primaryDoc}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'StockVision/1.0 marco.aedoa@gmail.com' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error('Filing fetch error ' + res.status);

  const html = await res.text();

  // Strip HTML tags, collapse whitespace, take first ~14k chars
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 14000);

  return text;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { searchParams } = req.nextUrl;
  const accession  = searchParams.get('accession');
  const form       = searchParams.get('form') ?? '10-Q';
  const date       = searchParams.get('date') ?? '';
  const primaryDoc = searchParams.get('doc') ?? '';

  if (!accession) {
    return NextResponse.json({ error: 'accession required' }, { status: 400 });
  }

  const cacheKey = `${ticker}_${accession}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ analysis: cached.analysis, cached: true });
  }

  const cik = TICKER_TO_CIK[ticker.toUpperCase()];
  if (!cik) {
    return NextResponse.json({ error: 'CIK not found' }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const cikNum = cik.replace(/^0+/, '');

  let filingText = '';
  if (primaryDoc) {
    try {
      filingText = await fetchFilingText(cikNum, accession, primaryDoc);
    } catch (err) {
      console.warn(`Could not fetch filing text for ${ticker} ${accession}:`, err);
    }
  }

  const prompt = filingText
    ? `Eres un analista financiero senior especializado en la lectura de reportes regulatorios ante la SEC.

Analiza el siguiente extracto del reporte ${form} de ${ticker} presentado ante la SEC el ${date}.

Proporciona un análisis claro y estructurado en español que incluya:
1. **Resultados financieros clave**: ingresos, utilidad neta, EPS y sus variaciones respecto al período anterior
2. **Tendencias y aspectos destacados**: qué está funcionando bien y qué no
3. **Riesgos mencionados**: factores de riesgo relevantes del período
4. **Perspectivas**: guidance de la empresa o expectativas futuras si se mencionan
5. **Veredicto**: una conclusión breve (máx 2 líneas) sobre la salud financiera del período

Mantén el análisis conciso (máx 350 palabras).

---
EXTRACTO DEL REPORTE:
${filingText}
---`
    : `Eres un analista financiero senior. Escribe un análisis conciso en español (máx 350 palabras) del reporte ${form} de ${ticker} correspondiente al período del ${date}.

Incluye:
1. **Resultados típicos del período**: contexto financiero esperado para esta empresa en ese trimestre
2. **Tendencias del sector**: factores macroeconómicos relevantes
3. **Perspectivas**: expectativas generales del negocio
4. **Veredicto**: conclusión breve sobre la posición financiera

Basa tu análisis en tu conocimiento de la empresa y su sector.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = (msg.content[0] as { text: string }).text;
    cache.set(cacheKey, { analysis, timestamp: Date.now() });
    return NextResponse.json({ analysis, cached: false });
  } catch (error) {
    console.error(`SEC analyze error for ${ticker}:`, error);
    return NextResponse.json({ error: 'Failed to generate analysis' }, { status: 500 });
  }
}
