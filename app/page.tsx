'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STOCKS as MOCK_STOCKS } from '@/lib/mockData';
import { Stock, SortField, SortDirection, Filters, Recommendation } from '@/types/stock';
import Header from '@/components/Header';
import ControlPanel from '@/components/ControlPanel';
import OpportunitiesHighlight from '@/components/OpportunitiesHighlight';
import StockTable from '@/components/StockTable';

const ALL_RECS: Recommendation[] = ['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'];

const DEFAULT_FILTERS: Filters = {
  search: '',
  minUpside: '',
  maxUpside: '',
  minPE: '',
  maxPE: '',
  recommendations: [...ALL_RECS],
};

type DataSource = 'loading' | 'live' | 'mock';

function navigateToStock(stock: Stock, router: ReturnType<typeof useRouter>) {
  try { sessionStorage.setItem('selectedStock', JSON.stringify(stock)); } catch {}
  router.push(`/stock/${stock.ticker}`);
}

function TableSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="animate-pulse p-4 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-center">
            <div className="w-6 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded" />
            <div className="w-20 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="w-20 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>('loading');
  const [sortField, setSortField] = useState<SortField>('upside');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);

  const fetchStocks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/stocks');
      if (!res.ok) throw new Error('API error ' + res.status);
      const data: Stock[] = await res.json();
      setStocks(data);
      setDataSource('live');
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch live data, using mock:', err);
      setStocks(MOCK_STOCKS);
      setDataSource('mock');
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  useEffect(() => {
    const interval = setInterval(fetchStocks, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStocks]);

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        return field;
      }
      setSortDirection('desc');
      return field;
    });
  }, []);

  const filteredAndSorted = useMemo(() => {
    const search = filters.search.toLowerCase();
    const minUpside = filters.minUpside !== '' ? parseFloat(filters.minUpside) : -Infinity;
    const maxUpside = filters.maxUpside !== '' ? parseFloat(filters.maxUpside) : Infinity;
    const minPE = filters.minPE !== '' ? parseFloat(filters.minPE) : -Infinity;
    const maxPE = filters.maxPE !== '' ? parseFloat(filters.maxPE) : Infinity;

    const filtered = stocks.filter(s => {
      if (search && !s.ticker.toLowerCase().includes(search) && !s.name.toLowerCase().includes(search)) return false;
      if (s.upside < minUpside || s.upside > maxUpside) return false;
      if (filters.minPE || filters.maxPE) {
        if (s.pe === null) return false;
        if (s.pe < minPE || s.pe > maxPE) return false;
      }
      if (!filters.recommendations.includes(s.recommendation)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortField) {
        case 'upside': aVal = a.upside; bVal = b.upside; break;
        case 'change24h': aVal = a.change24h; bVal = b.change24h; break;
        case 'pe': aVal = a.pe ?? -Infinity; bVal = b.pe ?? -Infinity; break;
        case 'currentPrice': aVal = a.currentPrice; bVal = b.currentPrice; break;
        case 'priceTarget': aVal = a.priceTarget; bVal = b.priceTarget; break;
        default: aVal = a.upside; bVal = b.upside;
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [stocks, filters, sortField, sortDirection]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header
        lastUpdated={lastUpdated}
        onRefresh={fetchStocks}
        isLoading={isLoading}
        dataSource={dataSource}
      />

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Investment Opportunities</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Top 20 US stocks ranked by analyst consensus and upside potential
          </p>
        </div>

        {dataSource === 'loading' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1].map(i => (
              <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 animate-pulse">
                <div className="w-40 h-4 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="flex gap-3 py-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded" />
                    <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <OpportunitiesHighlight stocks={stocks} onSelectStock={s => navigateToStock(s, router)} />
        )}

        <div className="space-y-3">
          <ControlPanel filters={filters} onChange={setFilters} />
          {dataSource === 'loading' ? (
            <TableSkeleton />
          ) : (
            <StockTable
              stocks={filteredAndSorted}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              onSelectStock={s => navigateToStock(s, router)}
            />
          )}
        </div>
      </main>

      <footer className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-800 mt-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span>StockVision · Datos con fines informativos. No constituye asesoramiento financiero.</span>
          <span>
            {dataSource === 'live' ? '🟢 Datos en vivo · ' : dataSource === 'mock' ? '🟡 Datos mock · ' : ''}
            Última actualización: {lastUpdated.toLocaleString()}
          </span>
        </div>
      </footer>

    </div>
  );
}
