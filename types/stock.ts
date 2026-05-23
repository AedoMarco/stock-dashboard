export interface HistoricalPrice {
  date: string;
  close: number;
}

export interface AnalystTargets {
  high: number;
  low: number;
  average: number;
}

export type Recommendation = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';

export interface Stock {
  ticker: string;
  name: string;
  sector: string;
  currentPrice: number;
  priceTarget: number;
  upside: number;
  change24h: number;
  pe: number | null;
  recommendation: Recommendation;
  historicalPrices: HistoricalPrice[];
  analystTargets: AnalystTargets;
  marketCap: string;
  volume: string;
  numAnalysts: number;
}

export type SortField = 'upside' | 'change24h' | 'pe' | 'currentPrice' | 'priceTarget';
export type SortDirection = 'asc' | 'desc';
export type DateRange = '3m' | '6m' | '12m';

export interface Filters {
  search: string;
  minUpside: string;
  maxUpside: string;
  minPE: string;
  maxPE: string;
  recommendations: Recommendation[];
}
