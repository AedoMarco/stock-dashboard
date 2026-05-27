export interface ForecastPoint {
  date: string;
  forecast: number;
  upper: number;
  lower: number;
}

export interface ForecastModel {
  points: ForecastPoint[];
  r2: number;
  dailyTrend: number;
  residualStd: number;
  expected30d: number;
  expected60d: number;
  expected90d: number;
  return30d: number;
  return90d: number;
  // Extended by multi-factor model
  factorScores?: import('./multiFactor').FactorScores;
  method?: string;
  annualReturnPct?: number;
  annualVolPct?: number;
}

function holtsSmoothing(prices: number[], alpha = 0.25, beta = 0.08) {
  if (prices.length < 2) return { level: prices[0] ?? 0, trend: 0, fitted: [...prices] };

  let level = prices[0];
  let trend = prices[1] - prices[0];
  const fitted: number[] = [level];

  for (let i = 1; i < prices.length; i++) {
    const prevLevel = level;
    level = alpha * prices[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    fitted.push(level);
  }

  return { level, trend, fitted };
}

function calculateR2(actual: number[], fitted: number[]): number {
  const mean = actual.reduce((s, v) => s + v, 0) / actual.length;
  const ssTot = actual.reduce((s, v) => s + (v - mean) ** 2, 0);
  const ssRes = actual.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0);
  return ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

export function computeForecast(
  history: { date: string; close: number }[],
  horizonDays = 90
): ForecastModel {
  if (history.length < 10) {
    const last = history[history.length - 1]?.close ?? 0;
    const today = new Date(history[history.length - 1]?.date ?? new Date());
    const points: ForecastPoint[] = Array.from({ length: horizonDays }, (_, i) => ({
      date: addBusinessDays(today, i + 1).toISOString().split('T')[0],
      forecast: last,
      upper: last * 1.05,
      lower: last * 0.95,
    }));
    return { points, r2: 0, dailyTrend: 0, residualStd: 0, expected30d: last, expected60d: last, expected90d: last, return30d: 0, return90d: 0 };
  }

  // Use last 120 days for calibration (or all available)
  const lookback = Math.min(120, history.length);
  const recent = history.slice(-lookback).map(d => d.close);
  const { level, trend, fitted } = holtsSmoothing(recent);

  // Residuals for confidence interval
  const residuals = recent.map((p, i) => p - fitted[i]);
  const residualStd = Math.sqrt(
    residuals.slice(-60).reduce((s, r) => s + r * r, 0) / Math.min(60, residuals.length)
  );

  const r2 = calculateR2(recent, fitted);
  const currentPrice = recent[recent.length - 1];
  const lastDate = new Date(history[history.length - 1].date);

  // Generate forecast points (business days only)
  const points: ForecastPoint[] = [];
  let businessDay = 0;
  let calendarDay = 0;
  while (businessDay < horizonDays) {
    calendarDay++;
    const d = new Date(lastDate);
    d.setDate(d.getDate() + calendarDay);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    businessDay++;

    const h = businessDay;
    const predicted = Math.max(level + h * trend, 0.01);
    // Confidence interval grows with sqrt(h), 90% interval (z=1.645)
    const margin = 1.645 * residualStd * Math.sqrt(h);
    points.push({
      date: d.toISOString().split('T')[0],
      forecast: parseFloat(predicted.toFixed(2)),
      upper: parseFloat((predicted + margin).toFixed(2)),
      lower: parseFloat(Math.max(predicted - margin, 0.01).toFixed(2)),
    });
  }

  const p30 = points[Math.min(29, points.length - 1)];
  const p60 = points[Math.min(59, points.length - 1)];
  const p90 = points[points.length - 1];

  return {
    points,
    r2,
    dailyTrend: trend,
    residualStd,
    expected30d: p30.forecast,
    expected60d: p60.forecast,
    expected90d: p90.forecast,
    return30d: parseFloat(((p30.forecast - currentPrice) / currentPrice * 100).toFixed(1)),
    return90d: parseFloat(((p90.forecast - currentPrice) / currentPrice * 100).toFixed(1)),
  };
}
