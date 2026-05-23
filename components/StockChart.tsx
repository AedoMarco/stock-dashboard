'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Stock, DateRange, HistoricalPrice } from '@/types/stock';
import { ForecastPoint } from '@/lib/forecast';
import { filterByDateRange, calculateMovingAverage } from '@/lib/calculations';

interface StockChartProps {
  stock: Stock;
  forecastPoints?: ForecastPoint[];
  showForecast?: boolean;
}

const historyCache = new Map<string, HistoricalPrice[]>();

interface TooltipEntry {
  dataKey: string; value: number; color: string; name: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-xs">
      <p className="text-gray-400 mb-2 font-medium">{label}</p>
      {payload.map((entry, i) =>
        entry.value != null && (
          <p key={i} className="font-mono" style={{ color: entry.color }}>
            {entry.name}: ${Number(entry.value).toFixed(2)}
          </p>
        )
      )}
    </div>
  );
}

export default function StockChart({ stock, forecastPoints, showForecast = false }: StockChartProps) {
  const [range, setRange] = useState<DateRange>('6m');
  const [showMA50, setShowMA50] = useState(true);
  const [showMA200, setShowMA200] = useState(false);
  const [allPrices, setAllPrices] = useState<HistoricalPrice[]>(stock.historicalPrices);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stock.historicalPrices.length > 0) {
      setAllPrices(stock.historicalPrices);
      return;
    }
    const cached = historyCache.get(stock.ticker);
    if (cached) { setAllPrices(cached); return; }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setAllPrices([]);

    fetch(`/api/stocks/${stock.ticker}/history`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((data: HistoricalPrice[]) => { historyCache.set(stock.ticker, data); setAllPrices(data); })
      .catch(err => { if (err.name !== 'AbortError') setError('No se pudo cargar el historial'); })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [stock.ticker, stock.historicalPrices]);

  const chartData = useMemo(() => {
    if (!allPrices.length) return [];

    const filtered = filterByDateRange(allPrices, range);
    const ma50 = calculateMovingAverage(allPrices, 50);
    const ma200 = calculateMovingAverage(allPrices, 200);
    const startIdx = allPrices.length - filtered.length;

    const historical = filtered.map((p, i) => ({
      date: p.date,
      Price: p.close,
      'MA 50': ma50[startIdx + i],
      'MA 200': ma200[startIdx + i],
      Forecast: undefined as number | undefined,
      Upper: undefined as number | undefined,
      Lower: undefined as number | undefined,
    }));

    if (!showForecast || !forecastPoints?.length) return historical;

    // Connect last historical point to forecast
    if (historical.length > 0) {
      const last = historical[historical.length - 1];
      historical[historical.length - 1] = {
        ...last,
        Forecast: last.Price,
        Upper: last.Price,
        Lower: last.Price,
      };
    }

    const forecastData = forecastPoints.map(f => ({
      date: f.date,
      Price: undefined as number | undefined,
      'MA 50': undefined as number | undefined,
      'MA 200': undefined as number | undefined,
      Forecast: f.forecast,
      Upper: f.upper,
      Lower: f.lower,
    }));

    return [...historical, ...forecastData];
  }, [allPrices, range, forecastPoints, showForecast]);

  const allValues = chartData.flatMap(d =>
    [d.Price, d.Forecast, d.Upper, d.Lower].filter((v): v is number => v != null)
  );
  const minPrice = allValues.length ? Math.min(...allValues) * 0.98 : 0;
  const maxPrice = allValues.length ? Math.max(...allValues) * 1.02 : 100;

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatY = (v: number) =>
    `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`;
  const tickInterval = range === '3m' ? 8 : range === '6m' ? 15 : 30;

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-1">
          {(['3m', '6m', '12m'] as DateRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                range === r
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowMA50(v => !v)}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
              showMA50
                ? 'bg-orange-500/15 text-orange-500 border-orange-500/30'
                : 'text-gray-400 border-gray-200 dark:border-gray-700'
            }`}
          >
            MA 50
          </button>
          <button
            onClick={() => setShowMA200(v => !v)}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
              showMA200
                ? 'bg-purple-500/15 text-purple-500 border-purple-500/30'
                : 'text-gray-400 border-gray-200 dark:border-gray-700'
            }`}
          >
            MA 200
          </button>
        </div>
      </div>

      <div style={{ height: 280 }}>
        {isLoading && (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-xs">Cargando historial...</span>
            </div>
          </div>
        )}
        {error && !isLoading && (
          <div className="h-full flex items-center justify-center text-red-400 text-sm">{error}</div>
        )}
        {!isLoading && !error && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                interval={tickInterval}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tickFormatter={formatY}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
              />

              {stock.priceTarget > 0 && (
                <ReferenceLine
                  y={stock.priceTarget}
                  stroke="#3b82f6"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                  label={{ value: 'Target', position: 'right', fontSize: 9, fill: '#3b82f6' }}
                />
              )}
              {showForecast && forecastPoints?.length && (
                <ReferenceLine
                  x={todayStr}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{ value: 'Hoy', position: 'top', fontSize: 9, fill: '#94a3b8' }}
                />
              )}

              <Line
                type="monotone"
                dataKey="Price"
                name="Precio"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3b82f6' }}
                connectNulls={false}
              />
              {showMA50 && (
                <Line
                  type="monotone"
                  dataKey="MA 50"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              )}
              {showMA200 && (
                <Line
                  type="monotone"
                  dataKey="MA 200"
                  stroke="#a855f7"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              )}
              {showForecast && forecastPoints?.length && (
                <>
                  <Line
                    type="monotone"
                    dataKey="Upper"
                    name="Banda superior"
                    stroke="#22c55e"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                    dot={false}
                    connectNulls
                    opacity={0.6}
                  />
                  <Line
                    type="monotone"
                    dataKey="Lower"
                    name="Banda inferior"
                    stroke="#ef4444"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                    dot={false}
                    connectNulls
                    opacity={0.6}
                  />
                  <Line
                    type="monotone"
                    dataKey="Forecast"
                    name="Proyección"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    strokeDasharray="7 3"
                    dot={false}
                    connectNulls
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
