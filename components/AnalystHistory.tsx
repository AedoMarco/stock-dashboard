'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import type { AnalystEntry } from '@/app/api/stocks/[ticker]/analysts/route';

interface AnalystHistoryProps {
  ticker: string;
}

const GRADE_COLOR: Record<string, string> = {};
function gradeColor(grade: string): string {
  if (!grade) return 'text-gray-400';
  const g = grade.toLowerCase();
  if (g.includes('strong buy') || g.includes('outperform') || g.includes('overweight') || g.includes('buy') || g.includes('positive') || g.includes('accumulate')) {
    return 'text-emerald-500';
  }
  if (g.includes('sell') || g.includes('underperform') || g.includes('underweight') || g.includes('negative') || g.includes('reduce') || g.includes('avoid')) {
    return 'text-red-400';
  }
  return 'text-yellow-500';
}

function ActionBadge({ action, ptAction }: { action: string; ptAction: string | null }) {
  const label = ptAction ?? action;
  if (!label) return null;

  const styles: Record<string, string> = {
    Raises: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    Lowers: 'bg-red-500/15 text-red-400 border-red-500/30',
    Maintains: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    Announces: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Initiates: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Adjusts: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
    up: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    down: 'bg-red-500/15 text-red-400 border-red-500/30',
    main: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    init: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    reit: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };

  const Icon = label === 'Raises' || label === 'up'
    ? TrendingUp
    : label === 'Lowers' || label === 'down'
    ? TrendingDown
    : Minus;

  const style = styles[label] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30';

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${style}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function AnalystHistory({ ticker }: AnalystHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<AnalystEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState<string>('all');

  useEffect(() => {
    if (!isOpen || data.length > 0) return;
    setLoading(true);
    setError(null);
    fetch(`/api/stocks/${ticker}/analysts`)
      .then(r => { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); })
      .then((d: AnalystEntry[]) => setData(d))
      .catch(() => setError('No se pudo cargar el historial de analistas.'))
      .finally(() => setLoading(false));
  }, [isOpen, ticker, data.length]);

  // Reset when ticker changes
  useEffect(() => {
    setData([]);
    setPage(1);
    setIsOpen(false);
    setFilterAction('all');
  }, [ticker]);

  const filtered = filterAction === 'all'
    ? data
    : data.filter(d => (d.priceTargetAction ?? d.action) === filterAction);

  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paginated.length < filtered.length;

  const formatDate = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ExternalLink size={15} className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Estimaciones de Analistas
          </span>
          {data.length > 0 && (
            <span className="text-xs bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded-full font-medium">
              {data.length}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>

      {isOpen && (
        <div className="bg-white dark:bg-gray-950">
          {loading && (
            <div className="flex justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}

          {error && (
            <p className="text-center text-sm text-red-400 py-6">{error}</p>
          )}

          {!loading && !error && data.length > 0 && (
            <>
              {/* Filter bar */}
              <div className="flex gap-1.5 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
                {['all', 'Raises', 'Lowers', 'Maintains', 'Initiates', 'Announces'].map(f => (
                  <button
                    key={f}
                    onClick={() => { setFilterAction(f); setPage(1); }}
                    className={`px-2.5 py-1 text-xs rounded-full font-medium whitespace-nowrap transition-colors ${
                      filterAction === f
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {f === 'all' ? 'Todos' : f}
                    {f === 'all' && ` (${data.length})`}
                    {f !== 'all' && ` (${data.filter(d => (d.priceTargetAction ?? d.action) === f).length})`}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Fecha</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Entidad</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">Calificación</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">P. Ant.</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">P. Nuevo</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cambio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                    {paginated.map((entry, i) => {
                      const changePositive = (entry.targetChange ?? 0) >= 0;
                      return (
                        <tr
                          key={i}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                        >
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono">
                            {formatDate(entry.date)}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white max-w-[130px]">
                            <div className="truncate">{entry.firm}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-1">
                              <ActionBadge action={entry.action} ptAction={entry.priceTargetAction} />
                              {entry.toGrade && (
                                <span className={`font-medium truncate max-w-[110px] ${gradeColor(entry.toGrade)}`}>
                                  {entry.toGrade}
                                </span>
                              )}
                              {entry.fromGrade && entry.fromGrade !== entry.toGrade && (
                                <span className="text-gray-400 truncate max-w-[110px] line-through">
                                  {entry.fromGrade}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {entry.priorTarget != null ? `$${entry.priorTarget}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                            {entry.currentTarget != null ? `$${entry.currentTarget}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {entry.targetChange != null ? (
                              <div className={`flex flex-col items-end ${changePositive ? 'text-emerald-500' : 'text-red-400'}`}>
                                <span className="font-semibold font-mono">
                                  {changePositive ? '+' : ''}{entry.targetChange}
                                </span>
                                {entry.targetChangePct != null && (
                                  <span className="opacity-75">
                                    {changePositive ? '+' : ''}{entry.targetChangePct}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
                  >
                    Mostrar más ({filtered.length - paginated.length} restantes)
                  </button>
                </div>
              )}

              <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
                Fuente: Yahoo Finance · Mostrando {paginated.length} de {filtered.length} registros
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
