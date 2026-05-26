import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { TICKER_TO_CIK } from '../route';

interface CacheEntry { analysis: string; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const EDGAR_HEADERS = { 'User-Agent': 'StockVision/1.0 marco.aedoa@gmail.com' };

interface XbrlUnit { accn: string; val: number; end: string; start?: string; form: string }

// Fetch one XBRL concept and return the value for the given accession number
async function fetchConcept(cik: string, concept: string, accession: string): Promise<{ concept: string; val: number; end: string } | null> {
  try {
    const res = await fetch(
      `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`,
      { headers: EDGAR_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();

    // Revenue can be in USD, EPS in USD/shares
    const units: XbrlUnit[] = data.units?.USD ?? data.units?.['USD/shares'] ?? [];
    const entry = units.find(u => u.accn === accession);
    if (!entry) return null;

    return { concept, val: entry.val, end: entry.end };
  } catch {
    return null;
  }
}

// Try a list of concept aliases and return the first one that has data
async function fetchFirstMatch(cik: string, aliases: string[], accession: string) {
  for (const alias of aliases) {
    const result = await fetchConcept(cik, alias, accession);
    if (result) return result;
  }
  return null;
}

function fmtVal(val: number, isEPS = false): string {
  if (isEPS) return `$${val.toFixed(2)}`;
  const abs = Math.abs(val);
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

async function buildFinancialSummary(cik: string, accession: string, form: string): Promise<string> {
  // Fetch key metrics in parallel (group by type to reduce requests)
  const [revenue, netIncome, operatingIncome, grossProfit, eps, rnd, cash] = await Promise.all([
    fetchFirstMatch(cik, [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
    ], accession),
    fetchConcept(cik, 'NetIncomeLoss', accession),
    fetchConcept(cik, 'OperatingIncomeLoss', accession),
    fetchConcept(cik, 'GrossProfit', accession),
    fetchConcept(cik, 'EarningsPerShareDiluted', accession),
    fetchConcept(cik, 'ResearchAndDevelopmentExpense', accession),
    fetchConcept(cik, 'CashAndCashEquivalentsAtCarryingValue', accession),
  ]);

  const metrics: string[] = [];
  const period = revenue?.end ?? netIncome?.end ?? '';

  if (revenue)          metrics.push(`Ingresos: ${fmtVal(revenue.val)}`);
  if (grossProfit)      metrics.push(`Utilidad bruta: ${fmtVal(grossProfit.val)}`);
  if (operatingIncome)  metrics.push(`Ingreso operacional: ${fmtVal(operatingIncome.val)}`);
  if (netIncome)        metrics.push(`Utilidad neta: ${fmtVal(netIncome.val)}`);
  if (eps)              metrics.push(`EPS diluido: ${fmtVal(eps.val, true)}`);
  if (rnd)              metrics.push(`Gasto I+D: ${fmtVal(rnd.val)}`);
  if (cash)             metrics.push(`Caja y equivalentes: ${fmtVal(cash.val)}`);

  if (metrics.length === 0) return '';

  return `Período reportado: ${period} (${form})\n\nMétricas financieras del reporte:\n${metrics.join('\n')}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { searchParams } = req.nextUrl;
  const accession = searchParams.get('accession');
  const form      = searchParams.get('form') ?? '10-Q';
  const date      = searchParams.get('date') ?? '';

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

  // Fetch structured XBRL financial data for this specific filing
  let financialSummary = '';
  try {
    financialSummary = await buildFinancialSummary(cik, accession, form);
  } catch (err) {
    console.warn(`XBRL fetch failed for ${ticker} ${accession}:`, err);
  }

  const prompt = financialSummary
    ? `Eres un analista financiero senior especializado en reportes SEC.

Analiza los siguientes datos financieros reales del reporte ${form} de ${ticker} (fecha de presentación: ${date}), extraídos directamente del XBRL de EDGAR.

${financialSummary}

Proporciona un análisis claro y conciso en español (máx 350 palabras) que incluya:
1. **Resultados clave**: interpreta los números anteriores, indica si son positivos o negativos y por qué
2. **Métricas de rentabilidad**: márgenes (si es posible calcularlos con los datos disponibles)
3. **Fortalezas y riesgos**: qué destacar de este período basándose en los números
4. **Veredicto**: una conclusión breve (máx 2 líneas) sobre la salud financiera del período

Sé directo con los números, sin inventar datos que no estén en el listado.`
    : `Eres un analista financiero senior. Escribe un análisis conciso en español (máx 300 palabras) del reporte ${form} de ${ticker} presentado el ${date}.

Incluye contexto del período, tendencias típicas de esta empresa en ese trimestre, factores del sector, y una conclusión breve. Aclara que el análisis está basado en conocimiento general de la empresa.`;

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
