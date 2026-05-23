import { NextRequest, NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

export interface AnalystEntry {
  date: string;
  firm: string;
  fromGrade: string;
  toGrade: string;
  action: string;
  priceTargetAction: string | null;
  priorTarget: number | null;
  currentTarget: number | null;
  targetChange: number | null;
  targetChangePct: number | null;
}

interface CacheEntry { data: AnalystEntry[]; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 horas

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
    const summary = await yf.quoteSummary(ticker, {
      modules: ['upgradeDowngradeHistory'],
    });

    const history = summary.upgradeDowngradeHistory?.history ?? [];

    const data: AnalystEntry[] = history
      .slice(0, 100) // most recent 100
      .map(h => {
        const prior = (h as unknown as Record<string, number>).priorPriceTarget ?? null;
        const current = (h as unknown as Record<string, number>).currentPriceTarget ?? null;
        const ptAction = (h as unknown as Record<string, string>).priceTargetAction ?? null;
        const change = prior && current ? parseFloat((current - prior).toFixed(2)) : null;
        const changePct = prior && current && prior > 0
          ? parseFloat(((current - prior) / prior * 100).toFixed(1))
          : null;

        return {
          date: new Date(h.epochGradeDate as unknown as string).toISOString().split('T')[0],
          firm: h.firm ?? '',
          fromGrade: h.fromGrade ?? '',
          toGrade: h.toGrade ?? '',
          action: h.action ?? '',
          priceTargetAction: ptAction,
          priorTarget: prior,
          currentTarget: current,
          targetChange: change,
          targetChangePct: changePct,
        };
      });

    cache.set(ticker, { data, timestamp: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Analysts error for ${ticker}:`, error);
    return NextResponse.json(
      { error: `Failed to fetch analyst data for ${ticker}` },
      { status: 500 }
    );
  }
}
