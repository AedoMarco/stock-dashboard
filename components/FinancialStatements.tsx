'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FinancialsResponse, FinancialPeriod, BalanceSheetSnapshot } from '@/app/api/stocks/[ticker]/financials/route';

interface Props {
  ticker: string;
  currency: string;
}

function fmt(v: number | null, currency: string): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const sym = currency === 'CLP' ? '' : '$';
  const suf = currency === 'CLP' ? '' : '';
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}${sym}${(abs / 1e6).toFixed(1)}M`;
  return `${sign}${sym}${abs.toLocaleString()}`;
}

function fmtPct(v: number | null): string {
  return v != null ? `${v.toFixed(1)}%` : '—';
}

function PeriodTable({ periods, currency }: { periods: FinancialPeriod[]; currency: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-2 pr-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Métrica</th>
            {periods.map(p => (
              <th key={p.date} className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {[
            { key: 'revenue', label: 'Ingresos' },
            { key: 'grossProfit', label: 'Utilidad Bruta' },
            { key: 'grossMarginPct', label: 'Margen Bruto', isPct: true },
            { key: 'operatingIncome', label: 'EBIT' },
            { key: 'operatingMarginPct', label: 'Margen EBIT', isPct: true },
            { key: 'ebitda', label: 'EBITDA' },
            { key: 'netIncome', label: 'Utilidad Neta' },
            { key: 'netMarginPct', label: 'Margen Neto', isPct: true },
            { key: 'eps', label: 'EPS', isEps: true },
          ].map(row => (
            <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400 whitespace-nowrap font-medium">{row.label}</td>
              {periods.map(p => {
                const val = p[row.key as keyof FinancialPeriod] as number | null;
                const isNeg = typeof val === 'number' && val < 0;
                return (
                  <td key={p.date} className={`py-1.5 px-2 text-right whitespace-nowrap tabular-nums ${isNeg ? 'text-red-500 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
                    {row.isPct ? fmtPct(val) : row.isEps ? (val != null ? val.toFixed(2) : '—') : fmt(val, currency)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceCard({ bs, currency }: { bs: BalanceSheetSnapshot; currency: string }) {
  const currentRatio = bs.currentAssets && bs.currentLiabilities
    ? (bs.currentAssets / bs.currentLiabilities).toFixed(2)
    : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
      {[
        { label: 'Activos Totales', value: fmt(bs.totalAssets, currency) },
        { label: 'Patrimonio', value: fmt(bs.totalEquity, currency) },
        { label: 'Caja', value: fmt(bs.cash, currency) },
        { label: 'Deuda Total', value: fmt(bs.totalDebt, currency) },
        { label: 'Ratio Corriente', value: currentRatio ?? '—' },
        { label: 'Fecha', value: bs.date },
      ].map(item => (
        <div key={item.label} className="bg-gray-50 dark:bg-gray-800/60 rounded-lg p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function FinancialStatements({ ticker, currency }: Props) {
  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'quarterly' | 'annual'>('quarterly');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisDate, setAnalysisDate] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetch(`/api/stocks/${ticker}/financials`)
      .then(r => r.json())
      .then((d: FinancialsResponse) => { setData(d); setLoading(false); })
      .catch(() => { setError('No se pudieron cargar los datos financieros.'); setLoading(false); });
  }, [ticker]);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const r = await fetch(`/api/stocks/${ticker}/financials/analyze`);
      const d = await r.json();
      setAnalysis(d.analysis);
      setAnalysisDate(d.date);
    } catch {
      setAnalysis('Error al generar el análisis.');
    }
    setAnalyzing(false);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-1">
        {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />)}
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-red-500">{error ?? 'Sin datos'}</p>;
  }

  const periods = tab === 'quarterly' ? data.quarterly : data.annual;
  const currLabel = data.currency === 'CLP' ? 'CLP (miles de millones)' : 'USD';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {(['quarterly', 'annual'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${tab === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t === 'quarterly' ? 'Trimestral' : 'Anual'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">En {currLabel}</span>
        <a
          href="https://www.cmfchile.cl/portalinversionistas/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 flex items-center gap-1"
        >
          Ver en CMF ↗
        </a>
      </div>

      {periods.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos disponibles para este período.</p>
      ) : (
        <PeriodTable periods={periods} currency={data.currency} />
      )}

      {data.balanceSheet && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Balance General</h4>
          <BalanceCard bs={data.balanceSheet} currency={data.currency} />
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        {!analysis ? (
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {analyzing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analizando estados financieros...
              </>
            ) : (
              <>✨ Analizar con IA</>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Análisis IA</span>
              {analysisDate && <span className="text-xs text-gray-400 dark:text-gray-500">{analysisDate}</span>}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-headings:text-gray-900 dark:prose-headings:text-white prose-strong:text-gray-900 dark:prose-strong:text-white prose-li:text-gray-700 dark:prose-li:text-gray-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
