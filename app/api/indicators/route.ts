import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import type { Indicator } from '@/types/indicator';

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

const YAHOO_INDICATORS: { symbol: string; id: string; label: string; region: 'US' | 'CL' }[] = [
  { symbol: '^GSPC', id: 'sp500', label: 'S&P 500', region: 'US' },
  { symbol: '^DJI', id: 'dowjones', label: 'Dow Jones', region: 'US' },
  { symbol: '^IXIC', id: 'nasdaq', label: 'Nasdaq', region: 'US' },
  { symbol: 'DX-Y.NYB', id: 'dxy', label: 'Dollar Index', region: 'US' },
  { symbol: '^IPSA', id: 'ipsa', label: 'IPSA', region: 'CL' },
  { symbol: 'CLP=X', id: 'usdclp', label: 'USD/CLP', region: 'CL' },
];

function formatNumber(v: number, decimals = 2): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

async function fetchYahooIndicators(): Promise<Indicator[]> {
  const symbols = YAHOO_INDICATORS.map(i => i.symbol);
  const quotesRaw = await yf.quote(symbols);
  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [quotesRaw];

  return quotes.map((q, i) => {
    const meta = YAHOO_INDICATORS[i];
    const price = q.regularMarketPrice ?? 0;
    return {
      id: meta.id,
      label: meta.label,
      region: meta.region,
      value: formatNumber(price, meta.id === 'usdclp' ? 2 : 2),
      changePercent: q.regularMarketChangePercent != null
        ? parseFloat(q.regularMarketChangePercent.toFixed(2))
        : null,
    } satisfies Indicator;
  });
}

interface MindicadorEntry { valor: number }
interface MindicadorResponse {
  uf: MindicadorEntry;
  dolar: MindicadorEntry;
  tpm: MindicadorEntry;
  libra_cobre: MindicadorEntry;
}

async function fetchChileMacroIndicators(): Promise<Indicator[]> {
  const res = await fetch('https://mindicador.cl/api', { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`mindicador.cl error ${res.status}`);
  const data: MindicadorResponse = await res.json();

  return [
    { id: 'uf', label: 'UF', region: 'CL', value: `$${formatNumber(data.uf.valor)}`, changePercent: null },
    { id: 'dolar_obs', label: 'Dólar Obs.', region: 'CL', value: `$${formatNumber(data.dolar.valor)}`, changePercent: null },
    { id: 'tpm', label: 'TPM', region: 'CL', value: `${formatNumber(data.tpm.valor, 2)}%`, changePercent: null },
    { id: 'cobre', label: 'Cobre', region: 'CL', value: `$${formatNumber(data.libra_cobre.valor)}/lb`, changePercent: null },
  ];
}

interface CacheEntry { data: Indicator[]; timestamp: number }
let indicatorsCache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  try {
    if (indicatorsCache && Date.now() - indicatorsCache.timestamp < CACHE_TTL) {
      return NextResponse.json(indicatorsCache.data);
    }

    const [yahooResult, macroResult] = await Promise.allSettled([
      fetchYahooIndicators(),
      fetchChileMacroIndicators(),
    ]);

    const indicators: Indicator[] = [
      ...(yahooResult.status === 'fulfilled' ? yahooResult.value : []),
      ...(macroResult.status === 'fulfilled' ? macroResult.value : []),
    ];

    if (yahooResult.status === 'rejected') console.error('Yahoo indicators error:', yahooResult.reason);
    if (macroResult.status === 'rejected') console.error('mindicador.cl error:', macroResult.reason);

    if (indicators.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });
    }

    indicatorsCache = { data: indicators, timestamp: Date.now() };
    return NextResponse.json(indicators);
  } catch (error) {
    console.error('Indicators error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch indicators', detail: String(error) },
      { status: 500 }
    );
  }
}
