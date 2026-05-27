import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { TICKER_TO_CIK } from '../route';

interface CacheEntry { analysis: string; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const EDGAR_HEADERS = { 'User-Agent': 'StockVision/1.0 marco.aedoa@gmail.com' };

interface XbrlUnit { accn: string; val: number; end: string; start?: string; form: string }

interface PeriodEntry { val: number; start: string; end: string }
interface ConceptData {
  quarterly:           PeriodEntry | null;  // ~90-day period
  ytd:                 PeriodEntry | null;  // year-to-date (Q2=180d, Q3=270d)
  annual:              PeriodEntry | null;  // ~365-day period
  priorYearQuarterly:  PeriodEntry | null;  // same quarter, prior year
  instant:             { val: number; end: string } | null; // balance sheet point-in-time
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function subtractOneYear(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().split('T')[0];
}

async function fetchConceptData(cik: string, concept: string, accession: string): Promise<ConceptData | null> {
  try {
    const res = await fetch(
      `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`,
      { headers: EDGAR_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const units: XbrlUnit[] = data.units?.USD ?? data.units?.['USD/shares'] ?? [];

    const filingEntries = units.filter(u => u.accn === accession);
    if (filingEntries.length === 0) return null;

    let quarterly: PeriodEntry | null = null;
    let ytd: PeriodEntry | null = null;
    let annual: PeriodEntry | null = null;
    let instant: { val: number; end: string } | null = null;

    for (const e of filingEntries) {
      if (!e.start) {
        if (!instant) instant = { val: e.val, end: e.end };
        continue;
      }
      const days = daysBetween(e.start, e.end);
      if (days >= 55 && days <= 120)  { quarterly = { val: e.val, start: e.start, end: e.end }; }
      else if (days >= 150 && days <= 300) { ytd = { val: e.val, start: e.start, end: e.end }; }
      else if (days >= 330 && days <= 400) { annual   = { val: e.val, start: e.start, end: e.end }; }
    }

    // Prior-year same quarter: find any entry with same period length shifted 1 year
    let priorYearQuarterly: PeriodEntry | null = null;
    if (quarterly) {
      const pyStart = subtractOneYear(quarterly.start);
      const pyEnd   = subtractOneYear(quarterly.end);
      const match   = units.find(u => u.start === pyStart && u.end === pyEnd);
      if (match) priorYearQuarterly = { val: match.val, start: pyStart, end: pyEnd };
    }

    const hasData = quarterly || ytd || annual || instant;
    return hasData ? { quarterly, ytd, annual, priorYearQuarterly, instant } : null;
  } catch {
    return null;
  }
}

async function fetchFirstConceptData(cik: string, aliases: string[], accession: string): Promise<ConceptData | null> {
  for (const alias of aliases) {
    const result = await fetchConceptData(cik, alias, accession);
    if (result) return result;
  }
  return null;
}

function fmtVal(val: number, isEPS = false): string {
  if (isEPS) return `$${val.toFixed(2)}`;
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(Math.abs(val) / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(Math.abs(val) / 1e6).toFixed(0)}M`;
  return `${sign}$${Math.abs(val).toFixed(0)}`;
}

function yoy(current: number, prior: number): string {
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% YoY`;
}

function formatConceptBlock(label: string, d: ConceptData, isEPS = false): string {
  const lines: string[] = [`**${label}**`];
  if (d.quarterly) {
    const yoyStr = d.priorYearQuarterly ? ` (${yoy(d.quarterly.val, d.priorYearQuarterly.val)})` : '';
    lines.push(`  - Trimestre (${d.quarterly.start} → ${d.quarterly.end}): **${fmtVal(d.quarterly.val, isEPS)}**${yoyStr}`);
  }
  if (d.priorYearQuarterly) {
    lines.push(`  - Mismo trimestre año anterior: ${fmtVal(d.priorYearQuarterly.val, isEPS)}`);
  }
  if (d.ytd) {
    lines.push(`  - Acumulado año (${d.ytd.start} → ${d.ytd.end}): ${fmtVal(d.ytd.val, isEPS)}`);
  }
  if (d.annual) {
    lines.push(`  - Año completo (${d.annual.start} → ${d.annual.end}): **${fmtVal(d.annual.val, isEPS)}**`);
  }
  if (d.instant) {
    lines.push(`  - Saldo al ${d.instant.end}: ${fmtVal(d.instant.val, isEPS)}`);
  }
  return lines.join('\n');
}

async function buildFinancialSummary(cik: string, accession: string, form: string, ticker: string): Promise<string> {
  const [revenue, netIncome, operatingIncome, grossProfit, eps, rnd, cash] = await Promise.all([
    fetchFirstConceptData(cik, [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
    ], accession),
    fetchConceptData(cik, 'NetIncomeLoss', accession),
    fetchConceptData(cik, 'OperatingIncomeLoss', accession),
    fetchConceptData(cik, 'GrossProfit', accession),
    fetchConceptData(cik, 'EarningsPerShareDiluted', accession),
    fetchConceptData(cik, 'ResearchAndDevelopmentExpense', accession),
    fetchFirstConceptData(cik, [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsAndShortTermInvestments',
    ], accession),
  ]);

  const blocks: string[] = [
    `**Empresa:** ${ticker}  |  **Reporte:** ${form}  |  **Accession:** ${accession}`,
    '',
  ];

  if (revenue)         blocks.push(formatConceptBlock('Ingresos / Revenues', revenue));
  if (grossProfit)     blocks.push(formatConceptBlock('Utilidad Bruta', grossProfit));
  if (operatingIncome) blocks.push(formatConceptBlock('Ingreso Operacional', operatingIncome));
  if (netIncome)       blocks.push(formatConceptBlock('Utilidad Neta', netIncome));
  if (eps)             blocks.push(formatConceptBlock('EPS Diluido', eps, true));
  if (rnd)             blocks.push(formatConceptBlock('Gasto I+D', rnd));
  if (cash)            blocks.push(formatConceptBlock('Caja y Equivalentes', cash));

  return blocks.length > 2 ? blocks.join('\n') : '';
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

  let financialSummary = '';
  try {
    financialSummary = await buildFinancialSummary(cik, accession, form, ticker);
  } catch (err) {
    console.warn(`XBRL fetch failed for ${ticker} ${accession}:`, err);
  }

  const prompt = financialSummary
    ? `Eres un analista financiero senior especializado en la lectura de reportes regulatorios ante la SEC.

A continuación se presentan datos financieros reales extraídos directamente del XBRL de EDGAR para el reporte ${form} de ${ticker} (presentado: ${date}). Los datos incluyen tanto el período trimestral como acumulado anual y comparación con el año anterior.

---
${financialSummary}
---

Escribe un análisis completo y detallado en **español** usando formato **Markdown**. El análisis debe incluir:

## 1. Resultados Trimestrales
Interpreta en profundidad los números del trimestre. Compara con el mismo trimestre del año anterior (YoY). Calcula márgenes si los datos lo permiten (margen bruto = utilidad bruta / ingresos, margen neto = utilidad neta / ingresos).

## 2. Resultados Anuales / Acumulados
Analiza el desempeño acumulado del año. ¿Va en línea con expectativas? ¿Qué tendencia muestra el año completo vs períodos anteriores?

## 3. Aspectos Destacados y Riesgos
- ¿Qué fortalezas muestra este reporte?
- ¿Qué señales de alerta o riesgos se identifican en los números?

## 4. Veredicto
Una conclusión directa sobre la salud financiera del período.

**Reglas de formato:**
- Escribe los cálculos en texto plano, por ejemplo: "Margen bruto: $56B / $82B = **67.6%**"
- **No uses LaTeX** ni notación matemática con $$ o \\frac o \\text. Solo texto y Markdown estándar.
- Usa exclusivamente los datos provistos. No inventes números que no estén en el listado. Si un dato no está disponible, dilo explícitamente.`
    : `Eres un analista financiero senior. Escribe un análisis detallado en **español** usando formato **Markdown** del reporte ${form} de ${ticker} presentado el ${date}.

El análisis debe incluir secciones claras para:
## 1. Resultados Trimestrales
## 2. Resultados Anuales / Acumulados
## 3. Aspectos Destacados y Riesgos
## 4. Veredicto

Basado en tu conocimiento general de la empresa y su sector. Aclara que el análisis es de contexto general.
**No uses LaTeX** ni notación matemática con $$ o \\frac. Solo texto y Markdown estándar.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
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
