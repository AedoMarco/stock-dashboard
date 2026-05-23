'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Filters, Recommendation } from '@/types/stock';

interface ControlPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const RECOMMENDATIONS: Recommendation[] = ['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'];

const REC_COLORS: Record<Recommendation, string> = {
  'Strong Buy': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  'Buy': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  'Hold': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  'Sell': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  'Strong Sell': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

export default function ControlPanel({ filters, onChange }: ControlPanelProps) {
  const hasActiveFilters =
    filters.minUpside || filters.maxUpside || filters.minPE || filters.maxPE || filters.recommendations.length < RECOMMENDATIONS.length;

  const toggleRec = (rec: Recommendation) => {
    const current = filters.recommendations;
    const next = current.includes(rec) ? current.filter(r => r !== rec) : [...current, rec];
    onChange({ ...filters, recommendations: next });
  };

  const clearAll = () => {
    onChange({
      search: '',
      minUpside: '',
      maxUpside: '',
      minPE: '',
      maxPE: '',
      recommendations: [...RECOMMENDATIONS],
    });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search ticker or company..."
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal size={14} className="text-gray-400 shrink-0" />
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Upside %:</span>
          <input
            type="number"
            placeholder="Min"
            value={filters.minUpside}
            onChange={e => onChange({ ...filters, minUpside: e.target.value })}
            className="w-16 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-xs">—</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.maxUpside}
            onChange={e => onChange({ ...filters, maxUpside: e.target.value })}
            className="w-16 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 shrink-0">P/E:</span>
          <input
            type="number"
            placeholder="Min"
            value={filters.minPE}
            onChange={e => onChange({ ...filters, minPE: e.target.value })}
            className="w-16 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-xs">—</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.maxPE}
            onChange={e => onChange({ ...filters, maxPE: e.target.value })}
            className="w-16 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 dark:text-gray-400">Recommendations:</span>
        {RECOMMENDATIONS.map(rec => (
          <button
            key={rec}
            onClick={() => toggleRec(rec)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-opacity ${REC_COLORS[rec]} ${
              filters.recommendations.includes(rec) ? 'opacity-100' : 'opacity-30'
            }`}
          >
            {rec}
          </button>
        ))}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-full transition-colors"
          >
            <X size={11} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
