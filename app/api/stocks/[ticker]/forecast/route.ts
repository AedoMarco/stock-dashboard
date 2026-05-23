import { NextRequest, NextResponse } from 'next/server';
import YahooFinanceClass from 'yahoo-finance2';
import Anthropic from '@anthropic-ai/sdk';
import { computeForecast, ForecastModel } from '@/lib/forecast';
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

function computeMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
}

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
  priceTarget: number,
  upside: number,
  recommendation: string,
  change24h: number,
  pe: number | null,
  numAnalysts: number,
  history: { date: string; close: number }[],
  model: ForecastModel
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes('sk-ant-...')) {
    return '⚙️ Agrega ANTHROPIC_API_KEY en .env.local para habilitar el análisis IA.';
  }

  const prices = history.map(h => h.close);
  const ma50 = computeMA(prices, 50);
  const ma200 = computeMA(prices, 200);
  const price6mAgo = history[Math.max(0, history.length - 130)]?.close ?? currentPrice;
  const trend6m = ((currentPrice - price6mAgo) / price6mAgo * 100).toFixed(1);
  const maSignal = ma50 && ma200
    ? (ma50 > ma200 ? 'Golden Cross (alcista)' : 'Death Cross (bajista)')
    : 'insuficientes datos';

  const prompt = `Eres un analista financiero cuantitativo experto. Analiza el siguiente stock y escribe un análisis de inversión conciso en español (4-5 oraciones, máximo 220 palabras).

**${name} (${ticker})**

Precio actual: $${currentPrice.toFixed(2)} | Cambio hoy: ${change24h >= 0 ? '+' : ''}${change24h}%
P/E: ${pe ?? 'N/A (pérdidas)'} | Analistas cubriendo: ${numAnalysts}
Target consenso analistas: $${priceTarget.toFixed(2)} | Upside: ${upside >= 0 ? '+' : ''}${upside}%
Recomendación: ${recommendation}

Tendencia 6M: ${Number(trend6m) >= 0 ? '+' : ''}${trend6m}%
MA50: ${ma50 ? '$' + ma50 : 'N/A'} | MA200: ${ma200 ? '$' + ma200 : 'N/A'}
Señal técnica: ${maSignal}

Proyección modelo estadístico (Holt's smoothing, bondad R²=${(model.r2 * 100).toFixed(0)}%):
- 30 días: $${model.expected30d.toFixed(2)} (${model.return30d >= 0 ? '+' : ''}${model.return30d}%)
- 90 días: $${model.expected90d.toFixed(2)} (${model.return90d >= 0 ? '+' : ''}${model.return90d}%)
- Tendencia diaria del modelo: ${model.dailyTrend >= 0 ? '+' : ''}$${model.dailyTrend.toFixed(3)}

Cubre en orden: (1) situación técnica actual, (2) alineación o divergencia entre analistas y modelo estadístico, (3) principal riesgo. Termina con un veredicto claro en negrita: **🟢 COMPRAR**, **🟡 MANTENER**, o **🔴 VENDER** con una justificación de 1 oración.`;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 450,
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
    return NextResponse.json({
      forecast: cached.forecast,
      analysis: cached.analysis,
      analysisDate: cached.analysisDate,
      cached: true,
    });
  }

  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);

    const [histRaw, quoteSummary] = await Promise.all([
      yf.historical(ticker, {
        period1: start.toISOString().split('T')[0],
        period2: end.toISOString().split('T')[0],
        interval: '1d',
      }),
      yf.quoteSummary(ticker, { modules: ['price', 'financialData'] }),
    ]);

    const history = histRaw
      .filter(d => d.close != null)
      .map(d => ({
        date: d.date.toISOString().split('T')[0],
        close: parseFloat(((d.adjClose ?? d.close) as number).toFixed(2)),
      }));

    const price = quoteSummary.price;
    const fin = quoteSummary.financialData;

    const currentPrice = price?.regularMarketPrice ?? history[history.length - 1]?.close ?? 0;
    const priceTarget = fin?.targetMeanPrice ?? currentPrice;
    const upside = currentPrice > 0
      ? parseFloat(((priceTarget - currentPrice) / currentPrice * 100).toFixed(1))
      : 0;

    const forecastModel = computeForecast(history);

    const analysis = await generateAnalysis(
      ticker,
      price?.longName ?? price?.shortName ?? ticker,
      currentPrice,
      priceTarget,
      upside,
      mapRecommendation(fin?.recommendationMean),
      parseFloat((price?.regularMarketChangePercent ?? 0).toFixed(2)),
      price?.regularMarketPrice ? (fin?.currentPrice ?? null) : null,
      fin?.numberOfAnalystOpinions ?? 0,
      history,
      forecastModel
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

    return NextResponse.json({
      forecast: forecastModel,
      analysis,
      analysisDate: entry.analysisDate,
      cached: false,
    });
  } catch (error) {
    console.error(`Forecast error for ${ticker}:`, error);
    return NextResponse.json(
      { error: `Failed to generate forecast for ${ticker}`, detail: String(error) },
      { status: 500 }
    );
  }
}
