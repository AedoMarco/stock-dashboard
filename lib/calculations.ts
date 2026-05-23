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
