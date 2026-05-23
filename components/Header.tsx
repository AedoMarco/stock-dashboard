'use client';

import { RefreshCw, Sun, Moon, TrendingUp } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

interface HeaderProps {
  lastUpdated: Date;
  onRefresh: () => void;
  isLoading: boolean;
  dataSource?: 'loading' | 'live' | 'mock';
}

export default function Header({ lastUpdated, onRefresh, isLoading, dataSource }: HeaderProps) {
  const { isDark, toggleTheme } = useTheme();

  const formatted = lastUpdated.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 dark:bg-blue-500">
            <TrendingUp size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-none">StockVision</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-none mt-0.5">US Market Dashboard</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {dataSource === 'live' && (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          )}
          {dataSource === 'mock' && (
            <span className="px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-medium border border-yellow-500/20">
              DEMO
            </span>
          )}
          <span>Actualizado: <span className="font-mono text-gray-700 dark:text-gray-300">{formatted}</span></span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
