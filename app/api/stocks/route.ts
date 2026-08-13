import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import type { Stock, Recommendation, Market } from '@/types/stock';
import { calculateMaxDrawdown, calculateChangeOverDays } from '@/lib/calculations';

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

const US_TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'BRK-B',
  'JPM', 'JNJ', 'V', 'WMT', 'PG', 'MA', 'NFLX', 'COST', 'CRM', 'ADBE', 'INTC', 'AMD',
];

const IPSA_TICKERS = [
  'FALABELLA.SN', 'COPEC.SN', 'SQM-B.SN', 'CHILE.SN', 'BSANTANDER.SN',
  'BCI.SN', 'CMPC.SN', 'CENCOSUD.SN', 'CCU.SN', 'COLBUN.SN',
  'ENELAM.SN', 'ENELCHILE.SN', 'LTM.SN', 'PARAUCO.SN', 'CAP.SN',
  'RIPLEY.SN', 'ITAUCL.SN', 'ECL.SN', 'ILC.SN', 'MALLPLAZA.SN',
  'AGUAS-A.SN', 'VAPORES.SN', 'SMU.SN', 'SALFACORP.SN', 'CONCHATORO.SN',
];

const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology',
  TSLA: 'Consumer Disc.', AMZN: 'Consumer Disc.', META: 'Technology',
  GOOGL: 'Technology', 'BRK-B': 'Financials', JPM: 'Financials',
  JNJ: 'Healthcare', V: 'Financials', WMT: 'Consumer Stap.',
  PG: 'Consumer Stap.', MA: 'Financials', NFLX: 'Communication',
  COST: 'Consumer Stap.', CRM: 'Technology', ADBE: 'Technology',
  INTC: 'Technology', AMD: 'Technology',
  'FALABELLA.SN': 'Retail', 'COPEC.SN': 'Energía', 'SQM-B.SN': 'Materiales',
  'CHILE.SN': 'Financiero', 'BSANTANDER.SN': 'Financiero', 'BCI.SN': 'Financiero',
  'CMPC.SN': 'Materiales', 'CENCOSUD.SN': 'Retail', 'CCU.SN': 'Consumo',
  'COLBUN.SN': 'Utilities', 'ENELAM.SN': 'Utilities', 'ENELCHILE.SN': 'Utilities',
  'LTM.SN': 'Industriales', 'PARAUCO.SN': 'Inmobiliario', 'CAP.SN': 'Materiales',
  'RIPLEY.SN': 'Retail', 'ITAUCL.SN': 'Financiero', 'ECL.SN': 'Utilities',
  'ILC.SN': 'Financiero', 'MALLPLAZA.SN': 'Inmobiliario', 'AGUAS-A.SN': 'Utilities',
  'VAPORES.SN': 'Industriales', 'SMU.SN': 'Consumo', 'SALFACORP.SN': 'Industriales',
  'CONCHATORO.SN': 'Consumo',
};

interface CacheEntry { data: Stock[]; timestamp: number }
let stockCache: CacheEntry | null = null;
const CACHE_TTL = 15 * 60 * 1000;

function formatMarketCap(v?: number | null, currency = 'USD'): string {
  if (!v) return 'N/A';
  const sym = currency === 'CLP' ? '' : '$';
  const suf = currency === 'CLP' ? ' CLP' : '';
  if (v >= 1e12) return `${sym}${(v / 1e12).toFixed(2)}T${suf}`;
  if (v >= 1e9)  return `${sym}${(v / 1e9).toFixed(1)}B${suf}`;
  return `${sym}${(v / 1e6).toFixed(0)}M${suf}`;
}

function formatVolume(v?: number | null): string {
  if (!v) return 'N/A';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return `${(v / 1e3).toFixed(0)}K`;
}

function mapRecommendation(mean?: number | null): Recommendation {
  if (!mean) return 'Hold';
  if (mean <= 1.5) return 'Strong Buy';
  if (mean <= 2.5) return 'Buy';
  if (mean <= 3.5) return 'Hold';
  if (mean <= 4.5) return 'Sell';
  return 'Strong Sell';
}

interface HistoricalMetrics { maxDrawdown1y: number | null; change30d: number | null; change60d: number | null }

async function fetchHistoricalMetrics(ticker: string): Promise<HistoricalMetrics> {
  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    const raw = await yf.historical(ticker, {
      period1: start.toISOString().split('T')[0],
      period2: end.toISOString().split('T')[0],
      interval: '1d',
    });
    const prices = raw
      .filter(d => d.close != null)
      .map(d => ({ date: d.date.toISOString().split('T')[0], close: d.close as number }));
    return {
      maxDrawdown1y: calculateMaxDrawdown(prices),
      change30d: calculateChangeOverDays(prices, 30),
      change60d: calculateChangeOverDays(prices, 60),
    };
  } catch {
    return { maxDrawdown1y: null, change30d: null, change60d: null };
  }
}

async function fetchMarket(tickers: string[], market: Market) {
  const [quotesRaw, summaries, historicalMetrics] = await Promise.all([
    yf.quote(tickers),
    Promise.allSettled(
      tickers.map(t => yf.quoteSummary(t, { modules: ['financialData', 'defaultKeyStatistics'] }))
    ),
    Promise.all(tickers.map(fetchHistoricalMetrics)),
  ]);

  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [quotesRaw];
  const currency = market === 'CL' ? 'CLP' : 'USD';

  return quotes.map((q, i) => {
    const ticker = tickers[i];
    const summary = summaries[i].status === 'fulfilled' ? summaries[i].value : null;
    const fin = summary?.financialData ?? null;
    const keyStats = summary?.defaultKeyStatistics ?? null;

    const currentPrice = q.regularMarketPrice ?? 0;
    const priceTarget = fin?.targetMeanPrice ?? currentPrice;
    const upside = currentPrice > 0
      ? parseFloat(((priceTarget - currentPrice) / currentPrice * 100).toFixed(1))
      : 0;

    return {
      ticker,
      name: q.longName ?? q.shortName ?? ticker,
      sector: SECTOR_MAP[ticker] ?? 'N/A',
      market,
      currency,
      currentPrice,
      priceTarget,
      upside,
      change24h: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
      change30d: historicalMetrics[i].change30d,
      change60d: historicalMetrics[i].change60d,
      pe: q.trailingPE ? parseFloat(q.trailingPE.toFixed(1)) : null,
      beta: keyStats?.beta ? parseFloat(keyStats.beta.toFixed(2)) : null,
      maxDrawdown1y: historicalMetrics[i].maxDrawdown1y,
      recommendation: mapRecommendation(fin?.recommendationMean),
      marketCap: formatMarketCap(q.marketCap, currency),
      volume: formatVolume(q.regularMarketVolume),
      numAnalysts: fin?.numberOfAnalystOpinions ?? 0,
      analystTargets: {
        high: fin?.targetHighPrice ?? priceTarget * 1.2,
        low: fin?.targetLowPrice ?? priceTarget * 0.8,
        average: priceTarget,
      },
      historicalPrices: [],
    } satisfies Stock;
  });
}

export async function GET() {
  try {
    if (stockCache && Date.now() - stockCache.timestamp < CACHE_TTL) {
      return NextResponse.json(stockCache.data);
    }

    const [usStocks, clStocks] = await Promise.all([
      fetchMarket(US_TICKERS, 'US'),
      fetchMarket(IPSA_TICKERS, 'CL'),
    ]);

    const stocks: Stock[] = [...usStocks, ...clStocks];
    stockCache = { data: stocks, timestamp: Date.now() };
    return NextResponse.json(stocks);
  } catch (error) {
    console.error('Yahoo Finance stocks error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock data', detail: String(error) },
      { status: 500 }
    );
  }
}
