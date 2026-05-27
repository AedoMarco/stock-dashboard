import type { ForecastPoint, ForecastModel } from './forecast';

// ─── Interfaces ────────────────────────────────────────────────────────────

export interface FactorScores {
  technical: number;    // -1 to +1
  fundamental: number;  // -1 to +1
  macro: number;        // -1 to +1
  composite: number;    // -1 to +1
  signals: string[];
}

export interface FundamentalInput {
  revenueGrowth:    number | null;
  earningsGrowth:   number | null;
  operatingMargins: number | null;
  analystUpside:    number;          // already a %
  recommendation:   string;
}

export interface MacroInput {
  yield10Y:        number | null;  // e.g. 4.5 = 4.5%
  vix:             number | null;
  sp500Return3m:   number | null;  // decimal, e.g. 0.08 = 8%
}

export interface HistoricalBar {
  date:    string;
  close:   number;
  volume?: number;
}

export interface MultiFactorResult extends ForecastModel {
  factorScores:         FactorScores;
  method:               string;
  annualReturnPct:      number;   // adjusted expected annual return %
  annualVolPct:         number;   // historical annualized vol %
}

// ─── Math helpers ──────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function calcMA(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

/** Wilder's RSI (proper smoothing, not simple average) */
function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  let avgGain = changes.slice(0, period).reduce((s, c) => s + Math.max(c, 0), 0) / period;
  let avgLoss = changes.slice(0, period).reduce((s, c) => s + Math.max(-c, 0), 0) / period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Daily log-return standard deviation (historical vol) */
function calcDailyVol(prices: number[], period = 60): number {
  const start = Math.max(1, prices.length - period);
  const logRets: number[] = [];
  for (let i = start; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) logRets.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (logRets.length < 2) return 0.015;
  const mean = logRets.reduce((s, v) => s + v, 0) / logRets.length;
  const variance = logRets.reduce((s, v) => s + (v - mean) ** 2, 0) / (logRets.length - 1);
  return Math.sqrt(variance);
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

// ─── Technical layer ────────────────────────────────────────────────────────

function computeTechnical(bars: HistoricalBar[]): { score: number; signals: string[] } {
  const signals: string[] = [];
  if (bars.length < 30) return { score: 0, signals: ['Historial insuficiente para señales técnicas'] };

  const prices  = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume ?? 0);
  const px      = prices[prices.length - 1];

  // — Momentum 1m / 3m / 6m —
  const mom1m = prices.length > 21  ? (px - prices[prices.length - 22])  / prices[prices.length - 22]  : 0;
  const mom3m = prices.length > 63  ? (px - prices[prices.length - 64])  / prices[prices.length - 64]  : 0;
  const mom6m = prices.length > 126 ? (px - prices[prices.length - 127]) / prices[prices.length - 127] : 0;

  if (mom1m >  0.08) signals.push(`Momentum 1m fuerte (+${(mom1m * 100).toFixed(1)}%)`);
  if (mom1m < -0.08) signals.push(`Momentum 1m débil (${(mom1m * 100).toFixed(1)}%)`);
  if (mom3m >  0.15) signals.push(`Momentum 3m fuerte (+${(mom3m * 100).toFixed(1)}%)`);
  if (mom3m < -0.15) signals.push(`Momentum 3m negativo (${(mom3m * 100).toFixed(1)}%)`);

  // — RSI —
  const rsi = calcRSI(prices);
  if (rsi > 70) signals.push(`RSI sobrecomprado (${rsi.toFixed(0)})`);
  if (rsi < 30) signals.push(`RSI sobrevendido (${rsi.toFixed(0)}) — posible rebote`);

  // — MA crossover —
  const ma50  = prices.length >= 50  ? calcMA(prices, 50)  : null;
  const ma200 = prices.length >= 200 ? calcMA(prices, 200) : null;
  const maGap = ma50 && ma200 ? (ma50 - ma200) / ma200 : 0;
  if (ma50 && ma200) {
    if (ma50 > ma200) signals.push(`Golden Cross activo (MA50 > MA200, gap ${(maGap * 100).toFixed(1)}%)`);
    else              signals.push(`Death Cross activo (MA50 < MA200, gap ${(maGap * 100).toFixed(1)}%)`);
  }

  // — Volume trend —
  const recentVol = volumes.slice(-10).filter(v => v > 0);
  const baseVol   = volumes.slice(-50, -10).filter(v => v > 0);
  let volSignal   = 0;
  if (recentVol.length > 0 && baseVol.length > 0) {
    const avgR = recentVol.reduce((s, v) => s + v, 0) / recentVol.length;
    const avgB = baseVol.reduce((s, v) => s + v, 0) / baseVol.length;
    const ratio = avgR / avgB - 1;
    volSignal = clamp(ratio * 2, -1, 1) * Math.sign(mom1m || 0.001);
    if (ratio > 0.3 && mom1m > 0) signals.push(`Volumen creciente con precio al alza — señal alcista`);
    if (ratio > 0.3 && mom1m < 0) signals.push(`Volumen creciente con precio a la baja — presión vendedora`);
  }

  const score =
    clamp(mom1m / 0.15, -1, 1) * 0.15 +
    clamp(mom3m / 0.25, -1, 1) * 0.25 +
    clamp(mom6m / 0.40, -1, 1) * 0.20 +
    clamp((rsi - 50) / 50, -1, 1) * 0.15 +
    clamp(maGap * 10,  -1, 1) * 0.15 +
    volSignal * 0.10;

  return { score: clamp(score, -1, 1), signals };
}

// ─── Fundamental layer ──────────────────────────────────────────────────────

function computeFundamental(f: FundamentalInput): { score: number; signals: string[] } {
  const signals: string[] = [];

  const revS = f.revenueGrowth  !== null ? clamp(f.revenueGrowth  / 0.25, -1, 1) : 0;
  const epsS = f.earningsGrowth !== null ? clamp(f.earningsGrowth / 0.30, -1, 1) : 0;
  const mgnS = f.operatingMargins !== null ? clamp(f.operatingMargins / 0.25, -1, 1) : 0;
  const upS  = clamp(f.analystUpside / 25, -1, 1);
  const recMap: Record<string, number> = {
    'Strong Buy': 1.0, 'Buy': 0.5, 'Hold': 0, 'Sell': -0.5, 'Strong Sell': -1.0,
  };
  const recS = recMap[f.recommendation] ?? 0;

  if (f.revenueGrowth !== null) {
    if (f.revenueGrowth > 0.20) signals.push(`Revenue creciendo +${(f.revenueGrowth * 100).toFixed(0)}% YoY`);
    if (f.revenueGrowth < -0.05) signals.push(`Revenue en declive ${(f.revenueGrowth * 100).toFixed(0)}% YoY`);
  }
  if (f.earningsGrowth !== null) {
    if (f.earningsGrowth > 0.25) signals.push(`Earnings +${(f.earningsGrowth * 100).toFixed(0)}% YoY — aceleración`);
    if (f.earningsGrowth < -0.10) signals.push(`Earnings cayendo ${(f.earningsGrowth * 100).toFixed(0)}% YoY`);
  }
  if (f.analystUpside > 20) signals.push(`Analistas ven +${f.analystUpside.toFixed(0)}% de upside (${f.recommendation})`);
  if (f.analystUpside < -10) signals.push(`Analistas ven ${f.analystUpside.toFixed(0)}% de downside`);

  const score =
    revS * 0.25 +
    epsS * 0.25 +
    upS  * 0.30 +
    recS * 0.15 +
    mgnS * 0.05;

  return { score: clamp(score, -1, 1), signals };
}

// ─── Macro layer ─────────────────────────────────────────────────────────────

function computeMacro(m: MacroInput): { score: number; signals: string[] } {
  const signals: string[] = [];

  // 10Y yield: neutral ~3.5-4%, pressures valuations above 5%
  let yieldS = 0;
  if (m.yield10Y !== null) {
    yieldS = clamp(-(m.yield10Y - 4.0) / 2.0, -1, 1);
    if (m.yield10Y > 5.0) signals.push(`Tasa 10Y en ${m.yield10Y.toFixed(1)}% — presión sobre valuaciones growth`);
    if (m.yield10Y < 3.5) signals.push(`Tasa 10Y en ${m.yield10Y.toFixed(1)}% — favorable para equities`);
  }

  // VIX: fear gauge
  let vixS = 0;
  if (m.vix !== null) {
    if      (m.vix < 15) { vixS =  0.4; }
    else if (m.vix < 20) { vixS =  0.1; }
    else if (m.vix < 30) { vixS = -0.3; signals.push(`VIX elevado (${m.vix.toFixed(0)}) — volatilidad creciente`); }
    else if (m.vix < 40) { vixS = -0.6; signals.push(`VIX alto (${m.vix.toFixed(0)}) — incertidumbre de mercado`); }
    else                 { vixS = -0.8; signals.push(`VIX extremo (${m.vix.toFixed(0)}) — pánico de mercado`); }
  }

  // S&P500 3m return: market tide
  let spS = 0;
  if (m.sp500Return3m !== null) {
    spS = clamp(m.sp500Return3m / 0.12, -1, 1);
    if (m.sp500Return3m >  0.08) signals.push(`Mercado alcista — S&P500 +${(m.sp500Return3m * 100).toFixed(1)}% (3m)`);
    if (m.sp500Return3m < -0.08) signals.push(`Mercado bajista — S&P500 ${(m.sp500Return3m * 100).toFixed(1)}% (3m)`);
  }

  const score = yieldS * 0.45 + vixS * 0.30 + spS * 0.25;
  return { score: clamp(score, -1, 1), signals };
}

// ─── Score → label ──────────────────────────────────────────────────────────

export function scoreLabel(s: number): string {
  if (s >=  0.6) return 'Muy Alcista';
  if (s >=  0.2) return 'Alcista';
  if (s >= -0.2) return 'Neutral';
  if (s >= -0.6) return 'Bajista';
  return 'Muy Bajista';
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function computeMultiFactorForecast(
  bars:        HistoricalBar[],
  fund:        FundamentalInput,
  macro:       MacroInput,
  horizonDays  = 90,
): MultiFactorResult {
  const prices = bars.map(b => b.close);
  const px     = prices[prices.length - 1];
  const lastDate = new Date(bars[bars.length - 1].date);

  // Factor scores
  const tech   = computeTechnical(bars);
  const fundam = computeFundamental(fund);
  const macroR = computeMacro(macro);

  const composite = tech.score * 0.40 + fundam.score * 0.40 + macroR.score * 0.20;

  const factorScores: FactorScores = {
    technical:   tech.score,
    fundamental: fundam.score,
    macro:       macroR.score,
    composite,
    signals: [...tech.signals, ...fundam.signals, ...macroR.signals],
  };

  // Base drift from 6-month historical return (annualized)
  const lookback = Math.min(126, prices.length - 1);
  const base6mRet = prices.length > lookback
    ? (px - prices[prices.length - 1 - lookback]) / prices[prices.length - 1 - lookback]
    : 0;
  const baseAnnual = base6mRet * 2;

  // Factor adjusts drift by up to ±20pp annualized
  const adjAnnual = clamp(baseAnnual + composite * 0.20, -0.60, 0.80);
  const dailyLogMu = Math.log(1 + adjAnnual) / 252;

  // Log-normal volatility (60-day)
  const dailyVol = calcDailyVol(prices, 60);
  const annualVol = dailyVol * Math.sqrt(252);

  // R² proxy: higher score coherence → higher R²
  const r2 = clamp(0.35 + Math.abs(composite) * 0.45, 0.35, 0.90);

  // Forecast using log-normal model: median = P₀·exp((μ_log - σ²/2)·h)
  const points: ForecastPoint[] = [];
  let bDay = 0, cDay = 0;

  while (bDay < horizonDays) {
    cDay++;
    const d = new Date(lastDate);
    d.setDate(d.getDate() + cDay);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    bDay++;

    const h       = bDay;
    const logDrift = dailyLogMu - 0.5 * dailyVol ** 2;
    const median  = px * Math.exp(logDrift * h);
    const upper   = px * Math.exp(logDrift * h + 1.645 * dailyVol * Math.sqrt(h));
    const lower   = px * Math.exp(logDrift * h - 1.645 * dailyVol * Math.sqrt(h));

    points.push({
      date:     d.toISOString().split('T')[0],
      forecast: parseFloat(median.toFixed(2)),
      upper:    parseFloat(upper.toFixed(2)),
      lower:    parseFloat(Math.max(lower, 0.01).toFixed(2)),
    });
  }

  const p30 = points[Math.min(29, points.length - 1)];
  const p60 = points[Math.min(59, points.length - 1)];
  const p90 = points[points.length - 1];

  return {
    points,
    r2,
    dailyTrend: Math.exp(dailyLogMu) - 1,
    residualStd: dailyVol,
    expected30d: p30.forecast,
    expected60d: p60.forecast,
    expected90d: p90.forecast,
    return30d: parseFloat(((p30.forecast - px) / px * 100).toFixed(1)),
    return90d: parseFloat(((p90.forecast - px) / px * 100).toFixed(1)),
    factorScores,
    method: 'Multi-Factor v1 (Técnico 40% · Fundamental 40% · Macro 20%)',
    annualReturnPct: parseFloat((adjAnnual * 100).toFixed(1)),
    annualVolPct:    parseFloat((annualVol * 100).toFixed(1)),
  };
}
