import { NextRequest, NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import Anthropic from '@anthropic-ai/sdk';
import type { FinancialPeriod, BalanceSheetSnapshot } from '../route';

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

interface CacheEntry { analysis: string; date: string; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function fmt(v: number | null, currency: string): string {
  if (v == null) return 'N/A';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const sym = currency === 'CLP' ? '' : '$';
  const suf = currency === 'CLP' ? ' CLP' : '';
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T${suf}`;
  if (abs >= 1e9)  return `${sign}${sym}${(abs / 1e9).toFixed(2)}B${suf}`;
  if (abs >= 1e6)  return `${sign}${sym}${(abs / 1e6).toFixed(1)}M${suf}`;
  return `${sign}${sym}${abs.toFixed(0)}${suf}`;
}

function fmtPct(v: number | null): string {
  return v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
}

function yoyChange(current: number | null, prior: number | null): string {
  if (current == null || prior == null || prior === 0) return '';
  const ch = ((current - prior) / Math.abs(prior)) * 100;
  return ` (${ch > 0 ? '+' : ''}${ch.toFixed(1)}% YoY)`;
}

function formatPeriodBlock(p: FinancialPeriod, prior: FinancialPeriod | undefined, currency: string): string {
  return `**${p.label}**
- Ingresos: ${fmt(p.revenue, currency)}${yoyChange(p.revenue, prior?.revenue ?? null)}
- Utilidad Bruta: ${fmt(p.grossProfit, currency)} | Margen: ${fmtPct(p.grossMarginPct)}
- EBIT: ${fmt(p.operatingIncome, currency)} | Margen Op.: ${fmtPct(p.operatingMarginPct)}
- EBITDA: ${fmt(p.ebitda, currency)}
- Utilidad Neta: ${fmt(p.netIncome, currency)}${yoyChange(p.netIncome, prior?.netIncome ?? null)} | Margen: ${fmtPct(p.netMarginPct)}
- EPS: ${p.eps != null ? p.eps.toFixed(2) : 'N/A'}`;
}

async function generateAnalysis(
  ticker: string,
  name: string,
  currency: string,
  quarterly: FinancialPeriod[],
  annual: FinancialPeriod[],
  balanceSheet: BalanceSheetSnapshot | null,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes('sk-ant-...')) {
    return '⚙️ Agrega ANTHROPIC_API_KEY en .env.local para habilitar el análisis IA.';
  }

  const recentQ = quarterly.slice(-6);
  const quarterlyBlocks = recentQ.map((p, i) => {
    const sameQuarterPriorYear = quarterly.find(q =>
      q.label.endsWith(String(new Date(p.date).getFullYear() - 1)) &&
      q.label.startsWith(p.label.split(' ')[0])
    );
    return formatPeriodBlock(p, sameQuarterPriorYear, currency);
  }).join('\n\n');

  const annualBlocks = annual.map((p, i) =>
    formatPeriodBlock(p, annual[i - 1], currency)
  ).join('\n\n');

  const bsBlock = balanceSheet ? `
**Balance General (${balanceSheet.date})**
- Activos Totales: ${fmt(balanceSheet.totalAssets, currency)}
- Patrimonio: ${fmt(balanceSheet.totalEquity, currency)}
- Caja y equivalentes: ${fmt(balanceSheet.cash, currency)}
- Deuda Total: ${fmt(balanceSheet.totalDebt, currency)}
- Ratio Corriente: ${balanceSheet.currentAssets && balanceSheet.currentLiabilities
    ? (balanceSheet.currentAssets / balanceSheet.currentLiabilities).toFixed(2)
    : 'N/A'}` : '';

  const prompt = `Eres un analista financiero senior. Analiza los estados financieros de **${name} (${ticker})** en **español** usando **Markdown** (máx 350 palabras, 4-5 párrafos).

### Resultados Trimestrales (últimos 6 trimestres)
${quarterlyBlocks}

### Resultados Anuales
${annualBlocks}

${bsBlock}

Estructura tu análisis así:
1. **Tendencia de ingresos y crecimiento**: ¿Está creciendo? ¿A qué ritmo?
2. **Rentabilidad y márgenes**: Análisis de márgenes bruto, operacional y neto. Tendencia.
3. **Balance y solidez financiera**: Liquidez, deuda, fortaleza del balance.
4. **Veredicto**: En negrita: **🟢 SÓLIDO**, **🟡 MODERADO** o **🔴 DÉBIL** con 1 oración de justificación.

No uses LaTeX ni notación matemática con $ o \\frac o \\text. Solo Markdown estándar.`;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = msg.content[0];
  return block.type === 'text' ? block.text : 'Análisis no disponible.';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ analysis: cached.analysis, date: cached.date, cached: true });
  }

  try {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 3);
    const p1str = period1.toISOString().split('T')[0];

    const [qFin, aFin, qBS, quoteRaw] = await Promise.all([
      yf.fundamentalsTimeSeries(ticker, { period1: p1str, type: 'quarterly', module: 'financials' })
        .catch(() => []),
      yf.fundamentalsTimeSeries(ticker, { period1: p1str, type: 'annual', module: 'financials' })
        .catch(() => []),
      yf.fundamentalsTimeSeries(ticker, { period1: p1str, type: 'quarterly', module: 'balance-sheet' })
        .catch(() => []),
      yf.quote(ticker).catch(() => null),
    ]);

    const currency = quoteRaw?.currency ?? 'USD';
    const name = quoteRaw?.longName ?? quoteRaw?.shortName ?? ticker;

    // Re-use the same mapping logic as the financials route
    function pct(num: number | null | undefined, den: number | null | undefined): number | null {
      if (!num || !den || den === 0) return null;
      return parseFloat(((num / den) * 100).toFixed(1));
    }

    function toIS(r: Record<string, unknown>, type: 'quarterly' | 'annual'): FinancialPeriod {
      const date = r.date as Date;
      const q = Math.ceil((date.getMonth() + 1) / 3);
      const revenue = (r.totalRevenue as number) ?? (r.operatingRevenue as number) ?? null;
      const grossProfit = (r.grossProfit as number) ?? null;
      const operatingIncome = (r.operatingIncome as number) ?? null;
      const netIncome = (r.netIncomeCommonStockholders as number) ?? (r.netIncome as number) ?? null;
      const ebitda = (r.EBITDA as number) ?? null;
      const eps = (r.dilutedEPS as number) ?? (r.basicEPS as number) ?? null;
      return {
        date: date.toISOString().split('T')[0],
        label: type === 'quarterly' ? `Q${q} ${date.getFullYear()}` : String(date.getFullYear()),
        type,
        revenue, grossProfit, operatingIncome, netIncome, ebitda, eps,
        grossMarginPct: pct(grossProfit, revenue),
        operatingMarginPct: pct(operatingIncome, revenue),
        netMarginPct: pct(netIncome, revenue),
      };
    }

    const quarterly = (qFin as Record<string, unknown>[]).map(r => toIS(r, 'quarterly')).slice(-8);
    const annual = (aFin as Record<string, unknown>[]).map(r => toIS(r, 'annual')).slice(-3);

    let balanceSheet: BalanceSheetSnapshot | null = null;
    if ((qBS as Record<string, unknown>[]).length > 0) {
      const latest = (qBS as Record<string, unknown>[])[qBS.length - 1];
      const bsDate = latest.date as Date;
      balanceSheet = {
        date: bsDate.toISOString().split('T')[0],
        totalAssets: (latest.totalAssets as number) ?? null,
        totalEquity: (latest.totalEquityGrossMinorityInterest as number)
          ?? (latest.commonStockEquity as number) ?? null,
        cash: (latest.cashAndCashEquivalents as number) ?? null,
        totalDebt: (latest.totalDebt as number) ?? null,
        currentAssets: (latest.currentAssets as number) ?? null,
        currentLiabilities: (latest.currentLiabilities as number) ?? null,
      };
    }

    const analysis = await generateAnalysis(ticker, name, currency, quarterly, annual, balanceSheet);
    const date = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });

    cache.set(ticker, { analysis, date, timestamp: Date.now() });
    return NextResponse.json({ analysis, date, cached: false });
  } catch (error) {
    console.error(`Financials analyze error for ${ticker}:`, error);
    return NextResponse.json(
      { error: `Failed to analyze financials for ${ticker}`, detail: String(error) },
      { status: 500 }
    );
  }
}
