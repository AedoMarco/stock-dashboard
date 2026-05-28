import { NextRequest, NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

export interface FinancialPeriod {
  date: string;
  label: string;
  type: 'quarterly' | 'annual';
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  ebitda: number | null;
  eps: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  netMarginPct: number | null;
}

export interface BalanceSheetSnapshot {
  date: string;
  totalAssets: number | null;
  totalEquity: number | null;
  cash: number | null;
  totalDebt: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
}

export interface FinancialsResponse {
  ticker: string;
  currency: string;
  quarterly: FinancialPeriod[];
  annual: FinancialPeriod[];
  balanceSheet: BalanceSheetSnapshot | null;
}

interface CacheEntry { data: FinancialsResponse; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 6 * 60 * 60 * 1000;

function labelQuarter(d: Date): string {
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

function pct(num: number | null | undefined, den: number | null | undefined): number | null {
  if (!num || !den || den === 0) return null;
  return parseFloat(((num / den) * 100).toFixed(1));
}

function toIS(r: Record<string, unknown>, type: 'quarterly' | 'annual'): FinancialPeriod {
  const date = r.date as Date;
  const revenue = (r.totalRevenue as number) ?? (r.operatingRevenue as number) ?? null;
  const grossProfit = (r.grossProfit as number) ?? null;
  const operatingIncome = (r.operatingIncome as number) ?? null;
  const netIncome = (r.netIncomeCommonStockholders as number) ?? (r.netIncome as number) ?? null;
  const ebitda = (r.EBITDA as number) ?? null;
  const eps = (r.dilutedEPS as number) ?? (r.basicEPS as number) ?? null;

  return {
    date: date.toISOString().split('T')[0],
    label: type === 'quarterly' ? labelQuarter(date) : String(date.getFullYear()),
    type,
    revenue,
    grossProfit,
    operatingIncome,
    netIncome,
    ebitda,
    eps,
    grossMarginPct: pct(grossProfit, revenue),
    operatingMarginPct: pct(operatingIncome, revenue),
    netMarginPct: pct(netIncome, revenue),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
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

    const currency = (quoteRaw?.currency ?? 'USD');

    const quarterly: FinancialPeriod[] = (qFin as Record<string, unknown>[])
      .map(r => toIS(r, 'quarterly'))
      .slice(-8);

    const annual: FinancialPeriod[] = (aFin as Record<string, unknown>[])
      .map(r => toIS(r, 'annual'))
      .slice(-3);

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

    const data: FinancialsResponse = { ticker, currency, quarterly, annual, balanceSheet };
    cache.set(ticker, { data, timestamp: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Financials error for ${ticker}:`, error);
    return NextResponse.json(
      { error: `Failed to fetch financials for ${ticker}`, detail: String(error) },
      { status: 500 }
    );
  }
}
