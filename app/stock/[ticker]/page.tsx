'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, TrendingUp, TrendingDown, BarChart3, Users, Brain, ChevronRight, RefreshCw, Activity,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Stock, Recommendation } from '@/types/stock';
import { ForecastPoint, ForecastModel } from '@/lib/forecast';
import { scoreLabel, type FactorScores } from '@/lib/multiFactor';
import { formatPercent } from '@/lib/calculations';
import StockChart from '@/components/StockChart';
import AnalystHistory from '@/components/AnalystHistory';
import SECFilings from '@/components/SECFilings';
import FinancialStatements from '@/components/FinancialStatements';

interface ForecastResponse {
  forecast: ForecastModel;
  analysis: string;
  analysisDate: string;
  cached: boolean;
}

const REC_STYLES: Record<Recommendation, string> = {
  'Strong Buy': 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
  'Buy':        'bg-green-500/15 text-green-500 border border-green-500/30',
  'Hold':       'bg-yellow-500/15 text-yellow-500 border border-yellow-500/30',
  'Sell':       'bg-orange-500/15 text-orange-500 border border-orange-500/30',
  'Strong Sell':'bg-red-500/15 text-red-500 border border-red-500/30',
};

interface MetricCardProps { label: string; value: string; sub?: string }
function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ForecastMetric({ label, value, pct, currency }: { label: string; value: number; pct: number; currency: string }) {
  const positive = pct >= 0;
  return (
    <div className="text-center bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{fmtPrice(value, currency)}</p>
      <p className={`text-sm font-semibold ${positive ? 'text-emerald-500' : 'text-red-400'}`}>
        {formatPercent(pct)}
      </p>
    </div>
  );
}

// ─── Factor Breakdown panel ────────────────────────────────────────────────

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.round((score + 1) / 2 * 100); // map -1…+1 → 0…100
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <span className={`text-xs font-bold ${score >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
          {scoreLabel(score)}
        </span>
      </div>
      <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        {/* center marker */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-gray-400 dark:bg-gray-500 z-10" />
        {score >= 0 ? (
          <div
            className={`absolute top-0 left-1/2 h-full rounded-r-full ${color}`}
            style={{ width: `${Math.abs(score) * 50}%` }}
          />
        ) : (
          <div
            className={`absolute top-0 right-1/2 h-full rounded-l-full ${color}`}
            style={{ width: `${Math.abs(score) * 50}%` }}
          />
        )}
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-gray-400">Muy Bajista</span>
        <span className="text-[10px] text-gray-400">Muy Alcista</span>
      </div>
    </div>
  );
}

function FactorBreakdown({ fs, annualReturnPct, annualVolPct }: {
  fs: FactorScores;
  annualReturnPct?: number;
  annualVolPct?: number;
}) {
  const compositeColor = fs.composite >= 0 ? 'text-emerald-500' : 'text-red-400';

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Análisis Multi-Factor</h3>
          <span className="text-xs bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded">
            Técnico · Fundamental · Macro
          </span>
        </div>
        <span className={`text-sm font-bold ${compositeColor}`}>
          {scoreLabel(fs.composite)}
        </span>
      </div>

      {/* Three factor bars */}
      <div className="space-y-4">
        <ScoreBar label="Técnico (40%)"     score={fs.technical}   color="bg-blue-500" />
        <ScoreBar label="Fundamental (40%)" score={fs.fundamental} color="bg-violet-500" />
        <ScoreBar label="Macro (20%)"       score={fs.macro}       color="bg-amber-500" />
      </div>

      {/* Composite + model stats */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="text-center bg-gray-50 dark:bg-gray-800/60 rounded-lg px-4 py-2 flex-1 min-w-[100px]">
          <p className="text-[10px] text-gray-400 mb-0.5">Score compuesto</p>
          <p className={`text-lg font-bold font-mono ${compositeColor}`}>
            {fs.composite >= 0 ? '+' : ''}{(fs.composite * 100).toFixed(0)}
          </p>
        </div>
        {annualReturnPct !== undefined && (
          <div className="text-center bg-gray-50 dark:bg-gray-800/60 rounded-lg px-4 py-2 flex-1 min-w-[100px]">
            <p className="text-[10px] text-gray-400 mb-0.5">Retorno anual esperado</p>
            <p className={`text-lg font-bold font-mono ${annualReturnPct >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
              {annualReturnPct >= 0 ? '+' : ''}{annualReturnPct}%
            </p>
          </div>
        )}
        {annualVolPct !== undefined && (
          <div className="text-center bg-gray-50 dark:bg-gray-800/60 rounded-lg px-4 py-2 flex-1 min-w-[100px]">
            <p className="text-[10px] text-gray-400 mb-0.5">Volatilidad anual</p>
            <p className="text-lg font-bold font-mono text-gray-700 dark:text-gray-300">{annualVolPct}%</p>
          </div>
        )}
      </div>

      {/* Active signals */}
      {fs.signals.length > 0 && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Señales activas
          </p>
          {fs.signals.map((sig, i) => {
            const isPositive = sig.toLowerCase().includes('fuerte') || sig.toLowerCase().includes('creciendo') ||
              sig.toLowerCase().includes('golden') || sig.toLowerCase().includes('alcista') ||
              sig.toLowerCase().includes('favorable') || sig.toLowerCase().includes('rebote') ||
              sig.toLowerCase().includes('upside') || sig.toLowerCase().includes('acelerac');
            const isNegative = sig.toLowerCase().includes('death') || sig.toLowerCase().includes('bajista') ||
              sig.toLowerCase().includes('presión') || sig.toLowerCase().includes('elevado') ||
              sig.toLowerCase().includes('alto') || sig.toLowerCase().includes('cayendo') ||
              sig.toLowerCase().includes('declive') || sig.toLowerCase().includes('pánico') ||
              sig.toLowerCase().includes('negativo') || sig.toLowerCase().includes('vendedora');
            const icon = isPositive ? '🟢' : isNegative ? '🔴' : '🟡';
            return (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span className="flex-shrink-0">{icon}</span>
                <span>{sig}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtPrice(price: number, currency: string): string {
  if (currency === 'CLP') {
    return price.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' CLP';
  }
  return '$' + price.toFixed(2);
}

function StockSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="grid grid-cols-4 gap-4">
        {[0,1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />)}
      </div>
    </div>
  );
}

export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const router = useRouter();

  const [stock, setStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [showForecast, setShowForecast] = useState(false);

  // Load stock data — try sessionStorage first for instant render, then API
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('selectedStock');
      if (stored) {
        const parsed: Stock = JSON.parse(stored);
        if (parsed.ticker === ticker) {
          setStock(parsed);
          setLoading(false);
        }
      }
    } catch {}

    fetch('/api/stocks')
      .then(r => r.ok ? r.json() : Promise.reject('API error'))
      .then((stocks: Stock[]) => {
        const found = stocks.find(s => s.ticker === ticker);
        if (found) {
          setStock(found);
          setError(null);
        } else {
          if (!stock) setError(`No se encontró ${ticker}`);
        }
      })
      .catch(() => {
        if (!stock) setError('No se pudo cargar la información');
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const fetchForecast = async () => {
    if (!stock) return;
    setForecastLoading(true);
    setForecastError(null);
    try {
      const res = await fetch(`/api/stocks/${stock.ticker}/forecast`);
      if (!res.ok) throw new Error('Error ' + res.status);
      const data: ForecastResponse = await res.json();
      setForecastData(data);
      setShowForecast(true);
    } catch {
      setForecastError('No se pudo generar el forecast. Intenta de nuevo.');
    } finally {
      setForecastLoading(false);
    }
  };

  const forecastPoints: ForecastPoint[] = forecastData?.forecast.points ?? [];

  if (loading && !stock) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <StockSkeleton />
        </div>
      </div>
    );
  }

  if (error && !stock) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="text-blue-500 underline">
            ← Volver al dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!stock) return null;

  const upsidePositive = stock.upside >= 0;
  const changePositive = stock.change24h >= 0;
  const upsideColor    = upsidePositive ? 'text-emerald-500' : 'text-red-400';
  const changeColor    = changePositive ? 'text-emerald-500' : 'text-red-400';
  const ChangeIcon     = changePositive ? TrendingUp : TrendingDown;

  const targetPct  = stock.analystTargets.high > stock.analystTargets.low
    ? ((stock.analystTargets.average - stock.analystTargets.low) / (stock.analystTargets.high - stock.analystTargets.low)) * 100
    : 50;
  const currentPct = stock.analystTargets.high > stock.analystTargets.low
    ? ((stock.currentPrice - stock.analystTargets.low) / (stock.analystTargets.high - stock.analystTargets.low)) * 100
    : 50;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            Volver
          </button>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">{stock.ticker}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${REC_STYLES[stock.recommendation]}`}>
              {stock.recommendation}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block truncate">{stock.name}</span>
          </div>

          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-lg font-bold font-mono text-gray-900 dark:text-white">{fmtPrice(stock.currentPrice, stock.currency ?? 'USD')}</p>
              <p className={`text-xs font-semibold ${changeColor} flex items-center justify-end gap-1`}>
                <ChangeIcon size={11} />
                {formatPercent(stock.change24h)} hoy
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Hero: price + target */}
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-4xl font-bold font-mono text-gray-900 dark:text-white">
              {fmtPrice(stock.currentPrice, stock.currency ?? 'USD')}
            </p>
            <div className={`flex items-center gap-1.5 mt-1 ${changeColor}`}>
              <ChangeIcon size={16} />
              <span className="font-semibold">{formatPercent(stock.change24h)} hoy</span>
            </div>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Precio objetivo</p>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-white">{fmtPrice(stock.priceTarget, stock.currency ?? 'USD')}</p>
              <p className={`text-sm font-bold ${upsideColor}`}>{formatPercent(stock.upside)} upside</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Sector</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{stock.sector}</p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <StockChart
            stock={stock}
            forecastPoints={forecastPoints}
            showForecast={showForecast}
          />
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="P/E Ratio"     value={stock.pe !== null ? stock.pe.toFixed(1) : 'N/A'} sub="Price / Earnings" />
          <MetricCard label="Market Cap"    value={stock.marketCap}    sub="Capitalización total" />
          <MetricCard label="Volumen (24h)" value={stock.volume}       sub="Acciones negociadas" />
          <MetricCard label="Analistas"     value={`${stock.numAnalysts}`} sub={`cobertura de ${stock.ticker}`} />
        </div>

        {/* Analyst targets bar */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Rango de Targets de Analistas</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Mín: {fmtPrice(stock.analystTargets.low, stock.currency ?? 'USD')}</span>
              <span>Consenso: {fmtPrice(stock.analystTargets.average, stock.currency ?? 'USD')}</span>
              <span>Máx: {fmtPrice(stock.analystTargets.high, stock.currency ?? 'USD')}</span>
            </div>
            <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full">
              <div className="absolute inset-0 h-3 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-emerald-400" />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white dark:bg-gray-900 border-2 border-blue-500 shadow-md"
                style={{ left: `calc(${Math.min(Math.max(targetPct, 2), 98)}% - 8px)` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white dark:bg-gray-200 border-2 border-gray-500 shadow"
                style={{ left: `calc(${Math.min(Math.max(currentPct, 2), 98)}% - 7px)` }}
              />
            </div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                Consenso analistas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                Precio actual
              </span>
            </div>
          </div>
        </div>

        {/* Consensus */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Consenso de Analistas</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className={`text-lg font-bold px-5 py-2.5 rounded-xl ${REC_STYLES[stock.recommendation]}`}>
              {stock.recommendation}
            </span>
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Basado en <strong>{stock.numAnalysts}</strong> analista{stock.numAnalysts !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Target promedio 12 meses: {fmtPrice(stock.analystTargets.average, stock.currency ?? 'USD')}
              </p>
            </div>
          </div>
        </div>

        {/* AI Forecast */}
        {!forecastData && !forecastLoading && (
          <button
            onClick={fetchForecast}
            className="w-full flex items-center justify-between px-5 py-4 rounded-xl bg-gradient-to-r from-violet-600/10 to-blue-600/10 border border-violet-500/20 hover:border-violet-500/40 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                <Brain size={20} className="text-violet-500" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 dark:text-white">Análisis IA + Forecast</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Claude Sonnet · Proyección estadística 90 días</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-400 group-hover:text-violet-500 transition-colors" />
          </button>
        )}

        {forecastLoading && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-violet-500/5 border border-violet-500/20">
            <RefreshCw size={18} className="text-violet-500 animate-spin flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Generando análisis...</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Claude está analizando indicadores técnicos</p>
            </div>
          </div>
        )}

        {forecastError && (
          <div className="px-5 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {forecastError}
            <button onClick={fetchForecast} className="ml-2 underline hover:no-underline">Reintentar</button>
          </div>
        )}

        {forecastData && (
          <div className="space-y-4">
            {/* Factor breakdown */}
            {forecastData.forecast.factorScores && (
              <FactorBreakdown
                fs={forecastData.forecast.factorScores}
                annualReturnPct={forecastData.forecast.annualReturnPct}
                annualVolPct={forecastData.forecast.annualVolPct}
              />
            )}

            {/* Price projections */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain size={15} className="text-violet-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Proyección de Precio</h3>
                </div>
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  IC 90% · vol {forecastData.forecast.annualVolPct ?? (forecastData.forecast.r2 * 100).toFixed(0)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <ForecastMetric label="30 días" value={forecastData.forecast.expected30d} pct={forecastData.forecast.return30d} currency={stock.currency ?? 'USD'} />
                <ForecastMetric label="60 días" value={forecastData.forecast.expected60d} pct={(forecastData.forecast.expected60d - stock.currentPrice) / stock.currentPrice * 100} currency={stock.currency ?? 'USD'} />
                <ForecastMetric label="90 días" value={forecastData.forecast.expected90d} pct={forecastData.forecast.return90d} currency={stock.currency ?? 'USD'} />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                {forecastData.forecast.method ?? 'Modelo estadístico'} · Log-normal · IC 90%
              </p>
            </div>

            {/* Claude narrative */}
            <div className="bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border border-violet-200 dark:border-violet-800/50 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain size={15} className="text-violet-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Análisis IA</h3>
                  <span className="text-xs text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">Claude Sonnet</span>
                </div>
                <div className="flex items-center gap-2">
                  {forecastData.cached && <span className="text-xs text-gray-400">caché</span>}
                  <button onClick={fetchForecast} className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-gray-400 hover:text-violet-500 transition-colors" title="Regenerar">
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 dark:text-white mt-3 mb-2 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 dark:text-white mt-3 mb-1.5 first:mt-0">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-300 mt-2 mb-1">{children}</h3>,
                  p: ({ children }) => <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 text-sm text-gray-700 dark:text-gray-300">{children}</ul>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                }}
              >
                {forecastData.analysis}
              </ReactMarkdown>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                Generado el {forecastData.analysisDate} · Solo con fines informativos
              </p>
            </div>
          </div>
        )}

        {/* Financial Reports */}
        {stock.market === 'CL' ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={15} className="text-emerald-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Resultados Financieros</h3>
              <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">CMF · Yahoo Finance</span>
            </div>
            <FinancialStatements ticker={ticker} currency={stock.currency ?? 'CLP'} />
          </div>
        ) : (
          <SECFilings ticker={ticker} />
        )}

        {/* Analyst history */}
        <AnalystHistory ticker={ticker} />

        {/* Footer spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}
