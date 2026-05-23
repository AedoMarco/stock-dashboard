import { NextRequest, NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

interface PricePoint { date: string; close: number }
interface CacheEntry { data: PricePoint[]; timestamp: number }

const historyCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  const cached = historyCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);

    const raw = await yf.historical(ticker, {
      period1: start.toISOString().split('T')[0],
      period2: end.toISOString().split('T')[0],
      interval: '1d',
    });

    const data: PricePoint[] = raw
      .filter(d => d.close != null)
      .map(d => ({
        date: d.date.toISOString().split('T')[0],
        close: parseFloat(((d.adjClose ?? d.close) as number).toFixed(2)),
      }));

    historyCache.set(ticker, { data, timestamp: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error(`History error for ${ticker}:`, error);
    return NextResponse.json(
      { error: `Failed to fetch history for ${ticker}` },
      { status: 500 }
    );
  }
}
