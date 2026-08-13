'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Indicator } from '@/types/indicator';

const REGION_FLAG: Record<Indicator['region'], string> = { US: '🇺🇸', CL: '🇨🇱' };

function IndicatorPill({ indicator }: { indicator: Indicator }) {
  const isUp = (indicator.changePercent ?? 0) >= 0;

  return (
    <div className="flex items-center gap-2 px-4 shrink-0">
      <span aria-hidden>{REGION_FLAG[indicator.region]}</span>
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{indicator.label}</span>
      <span className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">{indicator.value}</span>
      {indicator.changePercent !== null && (
        <span
          className={`flex items-center gap-0.5 text-xs font-mono font-medium ${
            isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {isUp ? '+' : ''}{indicator.changePercent.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

export default function IndicatorsTicker() {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchIndicators() {
      try {
        const res = await fetch('/api/indicators');
        if (!res.ok) throw new Error('API error ' + res.status);
        const data: Indicator[] = await res.json();
        if (!cancelled) setIndicators(data);
      } catch (err) {
        console.error('Failed to fetch indicators:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchIndicators();
    const interval = setInterval(fetchIndicators, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (isLoading && indicators.length === 0) {
    return (
      <div className="sticky top-16 z-30 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 h-9 flex items-center px-4">
        <div className="animate-pulse flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-24 h-3 bg-gray-200 dark:bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (indicators.length === 0) return null;

  return (
    <div className="sticky top-16 z-30 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-hidden group">
      <div className="flex w-max animate-ticker group-hover:[animation-play-state:paused]">
        {[0, 1].map(copy => (
          <div key={copy} className="flex items-center h-9" aria-hidden={copy === 1}>
            {indicators.map((ind, i) => (
              <IndicatorPill key={`${copy}-${ind.id}-${i}`} indicator={ind} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
