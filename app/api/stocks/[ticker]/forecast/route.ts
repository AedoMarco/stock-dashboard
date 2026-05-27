import { NextRequest, NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import Anthropic from '@anthropic-ai/sdk';
import { ForecastModel } from '@/lib/forecast';
import { computeMultiFactorForecast, scoreLabel, type FundamentalInput, type MacroInput } from '@/lib/multiFactor';
import type { Recommendation } from '@/types/stock';

const yf = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

interface CacheEntry {
  forecast: ForecastModel;
  analysis: string;
  analysisDate: string;
  timestamp: number;
}

const forecastCache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function mapRecommendation(mean?: number | null): Recommendation {
  if (!mean) return 'Hold';
  if (mean <= 1.5) return 'Strong Buy';
  if (mean <= 2.5) return 'Buy';
  if (mean <= 3.5) return 'Hold';
  if (mean <= 4.5) return 'Sell';
  return 'Strong Sell';
}

async function generateAnalysis(
  ticker: string,
  name: string,
  currentPrice: number,
  model: ForecastModel,
  fund: FundamentalInput,
  macro: MacroInput,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes('sk-ant-...')) {
    return '⚙️ Agrega ANTHROPIC_API_KEY en .env.local para habilitar el análisis IA.';
  }

  const fs = model.factorScores;
  const signalsList = fs?.signals.slice(0, 6).map(s => `  • ${s}`).join('\n') ?? '';

  const prompt = `Eres un analista financiero cuantitativo senior. Analiza el siguiente stock y escribe un análisis de inversión en **español** usando **Markdown** (máx 280 palabras, 4-5 párrafos).

**${name} (${ticker})** — Precio actual: $${currentPrice.toFixed(2)}

### Modelo Multi-Factor
- Score técnico: ${fs ? (fs.technical * 100).toFixed(0) : 'N/A'}/100 (${fs ? scoreLabel(fs.technical) : ''})
- Score fundamental: ${fs ? (fs.fundamental * 100).toFixed(0) : 'N/A'}/100 (${fs ? scoreLabel(fs.fundamental) : ''})
- Score macro: ${fs ? (fs.macro * 100).toFixed(0) : 'N/A'}/100 (${fs ? scoreLabel(fs.macro) : ''})
- Score compuesto: ${fs ? (fs.composite * 100).toFixed(0) : 'N/A'}/100 → **${fs ? scoreLabel(fs.composite) : 'N/A'}**
- Retorno anual ajustado esperado: ${model.annualReturnPct ?? 'N/A'}%
- Volatilidad histórica anualizada: ${model.annualVolPct ?? 'N/A'}%

### Señales activas
${signalsList || '  • Sin señales destacadas'}

### Proyección log-normal 90 días (IC 90%)
- 30d: $${model.expected30d.toFixed(2)} (${model.return30d >= 0 ? '+' : ''}${model.return30d}%)
- 60d: $${model.expected60d.toFixed(2)}
- 90d: $${model.expected90d.toFixed(2)} (${model.return90d >= 0 ? '+' : ''}${model.return90d}%)

### Macro
- Tasa 10Y: ${macro.yield10Y?.toFixed(1) ?? 'N/A'}% | VIX: ${macro.vix?.toFixed(1) ?? 'N/A'} | S&P500 3m: ${macro.sp500Return3m !== null ? (macro.sp500Return3m * 100).toFixed(1) + '%' : 'N/A'}

### Fundamentales
- Upside analistas: ${fund.analystUpside.toFixed(1)}% | Recomendación: ${fund.recommendation}
- Revenue growth: ${fund.revenueGrowth !== null ? (fund.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'} | Earnings growth: ${fund.earningsGrowth !== null ? (fund.earningsGrowth * 100).toFixed(1) + '%' : 'N/A'}
- Margen operacional: ${fund.operatingMargins !== null ? (fund.operatingMargins * 100).toFixed(1) + '%' : 'N/A'}

Estructura tu respuesta así:
1. Situación técnica actual y momentum
2. Fortaleza o debilidad fundamental
3. Contexto macro y su impacto
4. Veredicto final en negrita: **🟢 COMPRAR**, **🟡 MANTENER** o **🔴 VENDER** con justificación de 1 oración

No uses LaTeX. Solo Markdown estándar.`;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = msg.content[0];
  return block.type === 'text' ? block.text : 'Análisis no disponible.';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  const cached = forecastCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ forecast: cached.forecast, analysis: cached.analysis, analysisDate: cached.analysisDate, cached: true });
  }

  try {
    const today     = new Date();
    const date1yAgo = new Date(today); date1yAgo.setFullYear(today.getFullYear() - 1);
    const date70dAgo = new Date(today); date70dAgo.setDate(today.getDate() - 70);

    type YfBar = { date: Date; close: number | null; adjClose?: number | null; volume?: number | null };

    // Parallel: ticker history + quoteSummary + macro data
    const [histRaw, quoteSummary, spHistory, tnxQuote, vixQuote] = await Promise.all([
      yf.historical(ticker, {
        period1: date1yAgo.toISOString().split('T')[0],
        period2: today.toISOString().split('T')[0],
        interval: '1d',
      }) as Promise<YfBar[]>,
      yf.quoteSummary(ticker, {
        modules: ['price', 'financialData', 'defaultKeyStatistics'],
      }),
      (yf.historical('^GSPC', {
        period1: date70dAgo.toISOString().split('T')[0],
        period2: today.toISOString().split('T')[0],
        interval: '1d',
      }) as Promise<YfBar[]>).catch((): YfBar[] => []),
      yf.quote('^TNX').catch(() => null),
      yf.quote('^VIX').catch(() => null),
    ]);

    // Build price bars with volume
    const bars = histRaw
      .filter((d: YfBar) => d.close != null)
      .map((d: YfBar) => ({
        date:   d.date.toISOString().split('T')[0],
        close:  parseFloat(((d.adjClose ?? d.close) as number).toFixed(2)),
        volume: d.volume ?? undefined,
      }));

    const price = quoteSummary.price;
    const fin   = quoteSummary.financialData;

    const currentPrice = price?.regularMarketPrice ?? bars[bars.length - 1]?.close ?? 0;
    const priceTarget  = fin?.targetMeanPrice ?? currentPrice;
    const upside = currentPrice > 0
      ? parseFloat(((priceTarget - currentPrice) / currentPrice * 100).toFixed(1))
      : 0;

    // S&P500 3-month return
    const spFirst = spHistory[0]?.close ?? null;
    const spLast  = spHistory[spHistory.length - 1]?.close ?? null;
    const sp500Return3m = spFirst && spLast
      ? (spLast - spFirst) / spFirst
      : null;

    // Assemble inputs
    const fundInput: FundamentalInput = {
      revenueGrowth:    (fin?.revenueGrowth as number | null | undefined) ?? null,
      earningsGrowth:   (fin?.earningsGrowth as number | null | undefined) ?? null,
      operatingMargins: (fin?.operatingMargins as number | null | undefined) ?? null,
      analystUpside:    upside,
      recommendation:   mapRecommendation(fin?.recommendationMean as number | null | undefined),
    };

    const macroInput: MacroInput = {
      yield10Y:      (tnxQuote as { regularMarketPrice?: number } | null)?.regularMarketPrice ?? null,
      vix:           (vixQuote as { regularMarketPrice?: number } | null)?.regularMarketPrice ?? null,
      sp500Return3m,
    };

    // Run multi-factor model
    const forecastModel = computeMultiFactorForecast(bars, fundInput, macroInput);

    // Claude narrative
    const analysis = await generateAnalysis(
      ticker,
      price?.longName ?? price?.shortName ?? ticker,
      currentPrice,
      forecastModel,
      fundInput,
      macroInput,
    );

    const entry: CacheEntry = {
      forecast: forecastModel,
      analysis,
      analysisDate: new Date().toLocaleDateString('es-CL', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      timestamp: Date.now(),
    };

    forecastCache.set(ticker, entry);
    return NextResponse.json({ forecast: entry.forecast, analysis, analysisDate: entry.analysisDate, cached: false });
  } catch (error) {
    console.error(`Forecast error for ${ticker}:`, error);
    return NextResponse.json({ error: `Failed to generate forecast for ${ticker}`, detail: String(error) }, { status: 500 });
  }
}
