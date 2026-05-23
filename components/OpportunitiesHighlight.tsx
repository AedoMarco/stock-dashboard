'use client';

import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { Stock, Recommendation } from '@/types/stock';
import { formatPercent } from '@/lib/calculations';

interface OpportunitiesHighlightProps {
  stocks: Stock[];
  onSelectStock: (stock: Stock) => void;
}

const REC_BADGE: Record<Recommendation, string> = {
  'Strong Buy': 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
  'Buy': 'bg-green-500/15 text-green-500 border border-green-500/30',
  'Hold': 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/30',
  'Sell': 'bg-orange-500/15 text-orange-500 border border-orange-500/30',
  'Strong Sell': 'bg-red-500/15 text-red-500 border border-red-500/30',
};

interface StockCardProps {
  stock: Stock;
  rank: number;
  type: 'upside' | 'downside';
  onClick: () => void;
}

function StockCard({ stock, rank, type, onClick }: StockCardProps) {
  const isPositive = stock.upside >= 0;
  const upsideColor = isPositive ? 'text-emerald-500' : 'text-red-400';

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left group"
    >
      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs font-bold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-gray-900 dark:text-white">{stock.ticker}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${REC_BADGE[stock.recommendation]}`}>
            {stock.recommendation}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{stock.name}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${upsideColor}`}>
          {formatPercent(stock.upside)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          ${stock.priceTarget.toFixed(0)} target
        </p>
      </div>
      <ChevronRight size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}

export default function OpportunitiesHighlight({ stocks, onSelectStock }: OpportunitiesHighlightProps) {
  const sorted = [...stocks].sort((a, b) => b.upside - a.upside);
  const topUpside = sorted.slice(0, 5);
  const topDownside = sorted.slice(-5).reverse();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-emerald-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Top Upside Potential</h2>
        </div>
        <div className="space-y-1">
          {topUpside.map((stock, i) => (
            <StockCard
              key={stock.ticker}
              stock={stock}
              rank={i + 1}
              type="upside"
              onClick={() => onSelectStock(stock)}
            />
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={16} className="text-red-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Most Overvalued / Downside Risk</h2>
        </div>
        <div className="space-y-1">
          {topDownside.map((stock, i) => (
            <StockCard
              key={stock.ticker}
              stock={stock}
              rank={i + 1}
              type="downside"
              onClick={() => onSelectStock(stock)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
