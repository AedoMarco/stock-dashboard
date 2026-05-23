import { NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import type { Stock, Recommendation } from '@/types/stock';

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

const TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'BRK-B',
  'JPM', 'JNJ', 'V', 'WMT', 'PG', 'MA', 'NFLX', 'COST', 'CRM', 'ADBE', 'INTC', 'AMD',
];

const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology',
  TSLA: 'Consumer Disc.', AMZN: 'Consumer Disc.', META: 'Technology',
  GOOGL: 'Technology', 'BRK-B': 'Financials', JPM: 'Financials',
  JNJ: 'Healthcare', V: 'Financials', WMT: 'Consumer Stap.',
  PG: 'Consumer Stap.', MA: 'Financials', NFLX: 'Communication',
  COST: 'Consumer Stap.', CRM: 'Technology', ADBE: 'Technology',
  INTC: 'Technology', AMD: 'Technology',
};

interface CacheEntry { data: Stock[]; timestamp: number }
let stockCache: CacheEntry | null = null;
const CACHE_TTL = 15 * 60 * 1000;

function formatMarketCap(v?: number | null): string {
  if (!v) return 'N/A';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
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

export async function GET() {
  try {
    if (stockCache && Date.now() - stockCache.timestamp < CACHE_TTL) {
      return NextResponse.json(stockCache.data);
    }

    const [quotesRaw, summaries] = await Promise.all([
      yf.quote(TICKERS),
      Promise.allSettled(
        TICKERS.map(t => yf.quoteSummary(t, { modules: ['financialData'] }))
      ),
    ]);

    const quotes = Array.isArray(quotesRaw) ? quotesRaw : [quotesRaw];

    const stocks: Stock[] = quotes.map((q, i) => {
      const ticker = TICKERS[i];
      const fin = summaries[i].status === 'fulfilled'
        ? summaries[i].value.financialData
        : null;

      const currentPrice = q.regularMarketPrice ?? 0;
      const priceTarget = fin?.targetMeanPrice ?? currentPrice;
      const upside = currentPrice > 0
        ? parseFloat(((priceTarget - currentPrice) / currentPrice * 100).toFixed(1))
        : 0;

      return {
        ticker,
        name: q.longName ?? q.shortName ?? ticker,
        sector: SECTOR_MAP[ticker] ?? 'N/A',
        currentPrice,
        priceTarget,
        upside,
        change24h: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
        pe: q.trailingPE ? parseFloat(q.trailingPE.toFixed(1)) : null,
        recommendation: mapRecommendation(fin?.recommendationMean),
        marketCap: formatMarketCap(q.marketCap),
        volume: formatVolume(q.regularMarketVolume),
        numAnalysts: fin?.numberOfAnalystOpinions ?? 0,
        analystTargets: {
          high: fin?.targetHighPrice ?? priceTarget * 1.2,
          low: fin?.targetLowPrice ?? priceTarget * 0.8,
          average: priceTarget,
        },
        historicalPrices: [],
      };
    });

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
