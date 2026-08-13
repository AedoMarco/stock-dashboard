import { HistoricalPrice } from '@/types/stock';

export function calculateMovingAverage(prices: HistoricalPrice[], period: number): (number | null)[] {
  return prices.map((_, index) => {
    if (index < period - 1) return null;
    const slice = prices.slice(index - period + 1, index + 1);
    const avg = slice.reduce((sum, p) => sum + p.close, 0) / period;
    return parseFloat(avg.toFixed(2));
  });
}

export function filterByDateRange(prices: HistoricalPrice[], range: '3m' | '6m' | '12m'): HistoricalPrice[] {
  if (!prices.length) return prices;
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12;
  const endDate = new Date(prices[prices.length - 1].date);
  const cutoff = new Date(endDate);
  cutoff.setMonth(cutoff.getMonth() - months);
  return prices.filter(p => new Date(p.date) >= cutoff);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Largest peak-to-trough decline over the series, as a negative percentage (0 if the series never fell). */
export function calculateMaxDrawdown(prices: HistoricalPrice[]): number {
  if (prices.length < 2) return 0;
  let peak = prices[0].close;
  let maxDrawdown = 0;
  for (const p of prices) {
    if (p.close > peak) peak = p.close;
    const drawdown = ((p.close - peak) / peak) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return parseFloat(maxDrawdown.toFixed(2));
}

/** % change from the closing price ~`days` calendar days ago to the last close. Null if there isn't enough history. */
export function calculateChangeOverDays(prices: HistoricalPrice[], days: number): number | null {
  if (prices.length < 2) return null;
  const last = prices[prices.length - 1];
  const targetDate = new Date(last.date);
  targetDate.setDate(targetDate.getDate() - days);

  let reference: HistoricalPrice | null = null;
  for (const p of prices) {
    if (new Date(p.date) <= targetDate) reference = p;
    else break;
  }
  if (!reference || reference.close === 0) return null;
  return parseFloat(((last.close - reference.close) / reference.close * 100).toFixed(2));
}
