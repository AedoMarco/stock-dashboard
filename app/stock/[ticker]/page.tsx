'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, TrendingUp, TrendingDown, BarChart3, Users, Brain, ChevronRight, RefreshCw,
} from 'lucide-react';
import { Stock, Recommendation } from '@/types/stock';
import { ForecastPoint, ForecastModel } from '@/lib/forecast';
import { formatPercent } from '@/lib/calculations';
import StockChart from '@/components/StockChart';
import AnalystHistory from '@/components/AnalystHistory';
import SECFilings from '@/components/SECFilings';

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

function ForecastMetric({ label, value, pct }: { label: string; value: number; pct: number }) {
  const positive = pct >= 0;
  return (
    <div className="text-center bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">${value.toFixed(0)}</p>
      <p className={`text-sm font-semibold ${positive ? 'text-emerald-500' : 'text-red-400'}`}>
        {formatPercent(pct)}
      </p>
    </div>
  );
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
              <p className="text-lg font-bold font-mono text-gray-900 dark:text-white">${stock.currentPrice.toFixed(2)}</p>
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
              ${stock.currentPrice.toFixed(2)}
            </p>
            <div className={`flex items-center gap-1.5 mt-1 ${changeColor}`}>
              <ChangeIcon size={16} />
              <span className="font-semibold">{formatPercent(stock.change24h)} hoy</span>
            </div>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Precio objetivo</p>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-white">${stock.priceTarget.toFixed(2)}</p>
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
              <span>Mín: ${stock.analystTargets.low.toFixed(0)}</span>
              <span>Consenso: ${stock.analystTargets.average.toFixed(0)}</span>
              <span>Máx: ${stock.analystTargets.high.toFixed(0)}</span>
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
                Target promedio 12 meses: ${stock.analystTargets.average.toFixed(2)}
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
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain size={15} className="text-violet-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Proyección Estadística</h3>
                </div>
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  R² {(forecastData.forecast.r2 * 100).toFixed(0)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <ForecastMetric
                  label="30 días"
                  value={forecastData.forecast.expected30d}
                  pct={forecastData.forecast.return30d}
                />
                <ForecastMetric
                  label="60 días"
                  value={forecastData.forecast.expected60d}
                  pct={(forecastData.forecast.expected60d - stock.currentPrice) / stock.currentPrice * 100}
                />
                <ForecastMetric
                  label="90 días"
                  value={forecastData.forecast.expected90d}
                  pct={forecastData.forecast.return90d}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                Modelo Holt&apos;s double exponential smoothing · Banda de confianza 90%
              </p>
            </div>

            <div className="bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border border-violet-200 dark:border-violet-800/50 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain size={15} className="text-violet-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Análisis IA</h3>
                  <span className="text-xs text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">Claude Sonnet</span>
                </div>
                <div className="flex items-center gap-2">
                  {forecastData.cached && <span className="text-xs text-gray-400">caché</span>}
                  <button
                    onClick={fetchForecast}
                    className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-gray-400 hover:text-violet-500 transition-colors"
                    title="Regenerar análisis"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                {forecastData.analysis}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                Generado el {forecastData.analysisDate} · Solo con fines informativos
              </p>
            </div>
          </div>
        )}

        {/* SEC Filings */}
        <SECFilings ticker={ticker} />

        {/* Analyst history */}
        <AnalystHistory ticker={ticker} />

        {/* Footer spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}
