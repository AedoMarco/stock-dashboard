'use client';

import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Stock, SortField, SortDirection, Recommendation } from '@/types/stock';
import { formatPercent } from '@/lib/calculations';

interface StockTableProps {
  stocks: Stock[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onSelectStock: (stock: Stock) => void;
}

const REC_BADGE: Record<Recommendation, string> = {
  'Strong Buy': 'bg-emerald-500/15 text-emerald-500',
  'Buy': 'bg-green-500/15 text-green-500',
  'Hold': 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  'Sell': 'bg-orange-500/15 text-orange-500',
  'Strong Sell': 'bg-red-500/15 text-red-500',
};

function SortIcon({ field, active, direction }: { field: SortField; active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown size={13} className="text-gray-400" />;
  return direction === 'asc'
    ? <ChevronUp size={13} className="text-blue-500" />
    : <ChevronDown size={13} className="text-blue-500" />;
}

interface ThProps {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (f: SortField) => void;
  className?: string;
}

function Th({ field, label, sortField, sortDirection, onSort, className = '' }: ThProps) {
  return (
    <th
      className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon field={field} active={sortField === field} direction={sortDirection} />
      </div>
    </th>
  );
}

export default function StockTable({ stocks, sortField, sortDirection, onSort, onSelectStock }: StockTableProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="pl-4 pr-2 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-8">#</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ticker</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Sector</th>
              <Th field="currentPrice" label="Price" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              <Th field="priceTarget" label="Target" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              <Th field="upside" label="Upside" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              <Th field="change24h" label="Day %" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              <Th field="pe" label="P/E" sortField={sortField} sortDirection={sortDirection} onSort={onSort} className="hidden md:table-cell" />
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Rec.</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden xl:table-cell">Mkt Cap</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden xl:table-cell">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {stocks.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                  No stocks match the current filters.
                </td>
              </tr>
            )}
            {stocks.map((stock, i) => {
              const upsideColor = stock.upside > 10 ? 'text-emerald-600 dark:text-emerald-400' : stock.upside > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
              const changeColor = stock.change24h >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
              const upsideBg = stock.upside > 10 ? 'bg-emerald-50 dark:bg-emerald-900/20' : stock.upside > 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10';

              return (
                <tr
                  key={stock.ticker}
                  onClick={() => onSelectStock(stock)}
                  className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
                >
                  <td className="pl-4 pr-2 py-3 text-gray-400 dark:text-gray-500 text-xs">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white">{stock.ticker}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block truncate max-w-[120px]">{stock.name}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{stock.sector}</td>
                  <td className="px-3 py-3 font-mono font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    ${stock.currentPrice.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    ${stock.priceTarget.toFixed(2)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded font-medium text-xs font-mono ${upsideBg} ${upsideColor}`}>
                      {formatPercent(stock.upside)}
                    </span>
                  </td>
                  <td className={`px-3 py-3 font-mono text-sm font-medium whitespace-nowrap ${changeColor}`}>
                    {formatPercent(stock.change24h)}
                  </td>
                  <td className="px-3 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">
                    {stock.pe !== null ? stock.pe.toFixed(1) : <span className="text-gray-400">N/A</span>}
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REC_BADGE[stock.recommendation]}`}>
                      {stock.recommendation}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 hidden xl:table-cell">
                    {stock.marketCap}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 hidden xl:table-cell">
                    {stock.volume}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
        {stocks.length} stock{stocks.length !== 1 ? 's' : ''} shown
      </div>
    </div>
  );
}
