'use client';

import { useEffect, useState } from 'react';
import { X, TrendingUp, TrendingDown, Users, BarChart3, Brain, ChevronRight, RefreshCw } from 'lucide-react';
import AnalystHistory from './AnalystHistory';
import { Stock, Recommendation } from '@/types/stock';
import { ForecastPoint, ForecastModel } from '@/lib/forecast';
import { formatPercent } from '@/lib/calculations';
import StockChart from './StockChart';

interface ForecastResponse {
  forecast: ForecastModel;
  analysis: string;
  analysisDate: string;
  cached: boolean;
}

interface DetailViewProps {
  stock: Stock | null;
  onClose: () => void;
}

const REC_STYLES: Record<Recommendation, string> = {
  'Strong Buy': 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
  'Buy': 'bg-green-500/15 text-green-500 border border-green-500/30',
  'Hold': 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/30',
  'Sell': 'bg-orange-500/15 text-orange-500 border border-orange-500/30',
  'Strong Sell': 'bg-red-500/15 text-red-500 border border-red-500/30',
};

interface MetricCardProps { label: string; value: string; sub?: string }
function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

function ForecastMetric({ label, value, pct }: { label: string; value: number; pct: number }) {
  const positive = pct >= 0;
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-bold text-gray-900 dark:text-white">${value.toFixed(0)}</p>
      <p className={`text-xs font-semibold ${positive ? 'text-emerald-500' : 'text-red-400'}`}>
        {formatPercent(pct)}
      </p>
    </div>
  );
}

export default function DetailView({ stock, onClose }: DetailViewProps) {
  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [showForecast, setShowForecast] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (stock) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [stock]);

  // Reset forecast state when stock changes
  useEffect(() => {
    setForecastData(null);
    setForecastError(null);
    setShowForecast(false);
  }, [stock?.ticker]);

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

  if (!stock) return null;

  const upsidePositive = stock.upside >= 0;
  const changePositive = stock.change24h >= 0;
  const upsideColor = upsidePositive ? 'text-emerald-500' : 'text-red-400';
  const changeColor = changePositive ? 'text-emerald-500' : 'text-red-400';
  const ChangeIcon = changePositive ? TrendingUp : TrendingDown;

  const targetPct = stock.analystTargets.high > stock.analystTargets.low
    ? ((stock.analystTargets.average - stock.analystTargets.low) /
       (stock.analystTargets.high - stock.analystTargets.low)) * 100
    : 50;
  const currentPct = stock.analystTargets.high > stock.analystTargets.low
    ? ((stock.currentPrice - stock.analystTargets.low) /
       (stock.analystTargets.high - stock.analystTargets.low)) * 100
    : 50;

  const forecastPoints: ForecastPoint[] = forecastData?.forecast.points ?? [];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] lg:w-[540px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 z-50 overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{stock.ticker}</h2>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${REC_STYLES[stock.recommendation]}`}>
                {stock.recommendation}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{stock.name} · {stock.sector}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Price + Target */}
          <div className="flex items-end gap-4">
            <div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white font-mono">
                ${stock.currentPrice.toFixed(2)}
              </p>
              <div className={`flex items-center gap-1.5 mt-1 ${changeColor}`}>
                <ChangeIcon size={15} />
                <span className="text-sm font-semibold">{formatPercent(stock.change24h)} hoy</span>
              </div>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Target Analistas</p>
              <p className="text-xl font-bold font-mono text-gray-900 dark:text-white">${stock.priceTarget.toFixed(2)}</p>
              <p className={`text-sm font-bold ${upsideColor}`}>{formatPercent(stock.upside)}</p>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <StockChart
              stock={stock}
              forecastPoints={forecastPoints}
              showForecast={showForecast}
            />
          </div>

          {/* AI Forecast button / section */}
          {!forecastData && !forecastLoading && (
            <button
              onClick={fetchForecast}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600/10 to-blue-600/10 border border-violet-500/20 hover:border-violet-500/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <Brain size={16} className="text-violet-500" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Análisis IA + Forecast</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Claude Sonnet · Proyección 90 días</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-400 group-hover:text-violet-500 transition-colors" />
            </button>
          )}

          {forecastLoading && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
              <RefreshCw size={16} className="text-violet-500 animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Generando análisis...</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Claude está analizando indicadores técnicos</p>
              </div>
            </div>
          )}

          {forecastError && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {forecastError}
              <button onClick={fetchForecast} className="ml-2 underline hover:no-underline">Reintentar</button>
            </div>
          )}

          {forecastData && (
            <div className="space-y-3">
              {/* Forecast metrics */}
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
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
                    pct={((forecastData.forecast.expected60d - stock.currentPrice) / stock.currentPrice * 100)}
                  />
                  <ForecastMetric
                    label="90 días"
                    value={forecastData.forecast.expected90d}
                    pct={forecastData.forecast.return90d}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                  Modelo Holt&apos;s double exponential smoothing · Banda de confianza 90%
                </p>
              </div>

              {/* Claude analysis */}
              <div className="bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border border-violet-200 dark:border-violet-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Brain size={15} className="text-violet-500" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Análisis IA</h3>
                    <span className="text-xs text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">Claude Sonnet</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {forecastData.cached && (
                      <span className="text-xs text-gray-400">caché</span>
                    )}
                    <button
                      onClick={fetchForecast}
                      className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-gray-400 hover:text-violet-500 transition-colors"
                      title="Regenerar análisis"
                    >
                      <RefreshCw size={12} />
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

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="P/E Ratio" value={stock.pe !== null ? stock.pe.toFixed(1) : 'N/A'} sub="Price / Earnings" />
            <MetricCard label="Market Cap" value={stock.marketCap} sub="Capitalización total" />
            <MetricCard label="Volumen (24h)" value={stock.volume} sub="Acciones negociadas" />
            <MetricCard label="Analistas" value={`${stock.numAnalysts}`} sub={`cobertura de ${stock.ticker}`} />
          </div>

          {/* Analyst targets */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Targets de Analistas</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Min: ${stock.analystTargets.low.toFixed(0)}</span>
                <span>Consenso: ${stock.analystTargets.average.toFixed(0)}</span>
                <span>Max: ${stock.analystTargets.high.toFixed(0)}</span>
              </div>
              <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                <div className="absolute h-2 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-emerald-400 w-full" />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white dark:bg-gray-900 border-2 border-blue-500 shadow"
                  style={{ left: `calc(${Math.min(Math.max(targetPct, 2), 98)}% - 6px)` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white dark:bg-gray-200 border-2 border-gray-500 shadow"
                  style={{ left: `calc(${Math.min(Math.max(currentPct, 2), 98)}% - 5px)` }}
                />
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Consenso</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Precio actual</span>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users size={15} className="text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Consenso de Analistas</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold px-4 py-2 rounded-xl ${REC_STYLES[stock.recommendation]}`}>
                {stock.recommendation}
              </span>
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Basado en <strong>{stock.numAnalysts}</strong> analista{stock.numAnalysts !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Target 12 meses: ${stock.analystTargets.average.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Analyst history dropdown */}
          <AnalystHistory ticker={stock.ticker} />
        </div>
      </div>
    </>
  );
}
