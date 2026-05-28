import { Stock, HistoricalPrice, Recommendation } from '@/types/stock';

function createRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function generateHistoricalPrices(
  ticker: string,
  currentPrice: number,
  yearReturn: number,
  volatility = 0.015
): HistoricalPrice[] {
  const seed = ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0) * 31, 0);
  const rng = createRNG(seed);

  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 1);

  const tradingDays: string[] = [];
  const d = new Date(startDate);
  while (d <= endDate) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      tradingDays.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() + 1);
  }

  const n = tradingDays.length;
  const startPrice = currentPrice / (1 + yearReturn);
  const drift = (currentPrice - startPrice) / n;

  const prices: number[] = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const noise = (rng() - 0.5) * 2 * price * volatility;
    price = Math.max(price + drift + noise, 1);
    prices.push(price);
  }

  const scale = currentPrice / prices[prices.length - 1];
  return tradingDays.map((date, i) => ({
    date,
    close: parseFloat((prices[i] * scale).toFixed(2)),
  }));
}

interface StockDef {
  ticker: string;
  name: string;
  sector: string;
  currentPrice: number;
  priceTarget: number;
  change24h: number;
  pe: number | null;
  recommendation: Recommendation;
  marketCap: string;
  volume: string;
  numAnalysts: number;
  targetHigh: number;
  targetLow: number;
  volatility: number;
  yearReturn: number;
}

const stockDefs: StockDef[] = [
  {
    ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology',
    currentPrice: 195.20, priceTarget: 230.00, change24h: 1.23, pe: 32.1,
    recommendation: 'Buy', marketCap: '$2.95T', volume: '52.3M', numAnalysts: 42,
    targetHigh: 265.00, targetLow: 175.00, volatility: 0.014, yearReturn: 0.15,
  },
  {
    ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology',
    currentPrice: 415.80, priceTarget: 490.00, change24h: 0.85, pe: 35.4,
    recommendation: 'Strong Buy', marketCap: '$3.09T', volume: '18.7M', numAnalysts: 45,
    targetHigh: 540.00, targetLow: 390.00, volatility: 0.013, yearReturn: 0.20,
  },
  {
    ticker: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology',
    currentPrice: 948.30, priceTarget: 1200.00, change24h: 2.45, pe: 65.2,
    recommendation: 'Strong Buy', marketCap: '$2.33T', volume: '38.9M', numAnalysts: 48,
    targetHigh: 1400.00, targetLow: 700.00, volatility: 0.025, yearReturn: 1.50,
  },
  {
    ticker: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Disc.',
    currentPrice: 268.40, priceTarget: 265.00, change24h: -1.52, pe: 83.7,
    recommendation: 'Hold', marketCap: '$858.2B', volume: '87.4M', numAnalysts: 38,
    targetHigh: 380.00, targetLow: 175.00, volatility: 0.030, yearReturn: -0.10,
  },
  {
    ticker: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Disc.',
    currentPrice: 186.40, priceTarget: 225.00, change24h: 0.92, pe: 40.2,
    recommendation: 'Strong Buy', marketCap: '$1.97T', volume: '33.5M', numAnalysts: 50,
    targetHigh: 255.00, targetLow: 165.00, volatility: 0.016, yearReturn: 0.25,
  },
  {
    ticker: 'META', name: 'Meta Platforms', sector: 'Technology',
    currentPrice: 555.00, priceTarget: 625.00, change24h: 1.78, pe: 27.8,
    recommendation: 'Strong Buy', marketCap: '$1.40T', volume: '12.8M', numAnalysts: 44,
    targetHigh: 720.00, targetLow: 460.00, volatility: 0.018, yearReturn: 0.40,
  },
  {
    ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology',
    currentPrice: 168.30, priceTarget: 202.00, change24h: 0.54, pe: 21.5,
    recommendation: 'Buy', marketCap: '$2.06T', volume: '22.1M', numAnalysts: 46,
    targetHigh: 230.00, targetLow: 150.00, volatility: 0.014, yearReturn: 0.15,
  },
  {
    ticker: 'BRK.B', name: 'Berkshire Hathaway', sector: 'Financials',
    currentPrice: 375.90, priceTarget: 420.00, change24h: 0.31, pe: 14.8,
    recommendation: 'Buy', marketCap: '$831.5B', volume: '3.4M', numAnalysts: 18,
    targetHigh: 460.00, targetLow: 340.00, volatility: 0.012, yearReturn: 0.20,
  },
  {
    ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Financials',
    currentPrice: 223.40, priceTarget: 258.00, change24h: 0.72, pe: 12.9,
    recommendation: 'Buy', marketCap: '$644.8B', volume: '8.7M', numAnalysts: 32,
    targetHigh: 290.00, targetLow: 195.00, volatility: 0.013, yearReturn: 0.25,
  },
  {
    ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare',
    currentPrice: 152.30, priceTarget: 178.00, change24h: -0.18, pe: 17.5,
    recommendation: 'Buy', marketCap: '$364.2B', volume: '6.5M', numAnalysts: 35,
    targetHigh: 200.00, targetLow: 140.00, volatility: 0.011, yearReturn: 0.05,
  },
  {
    ticker: 'V', name: 'Visa Inc.', sector: 'Financials',
    currentPrice: 282.10, priceTarget: 328.00, change24h: 0.63, pe: 31.8,
    recommendation: 'Strong Buy', marketCap: '$601.4B', volume: '5.9M', numAnalysts: 36,
    targetHigh: 370.00, targetLow: 250.00, volatility: 0.012, yearReturn: 0.18,
  },
  {
    ticker: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Stap.',
    currentPrice: 94.20, priceTarget: 89.00, change24h: 0.41, pe: 36.2,
    recommendation: 'Hold', marketCap: '$758.1B', volume: '14.2M', numAnalysts: 28,
    targetHigh: 108.00, targetLow: 78.00, volatility: 0.011, yearReturn: 0.30,
  },
  {
    ticker: 'PG', name: 'Procter & Gamble', sector: 'Consumer Stap.',
    currentPrice: 172.50, priceTarget: 170.00, change24h: -0.09, pe: 26.4,
    recommendation: 'Hold', marketCap: '$405.8B', volume: '5.8M', numAnalysts: 25,
    targetHigh: 195.00, targetLow: 152.00, volatility: 0.010, yearReturn: 0.08,
  },
  {
    ticker: 'MA', name: 'Mastercard Inc.', sector: 'Financials',
    currentPrice: 488.90, priceTarget: 565.00, change24h: 0.91, pe: 37.5,
    recommendation: 'Strong Buy', marketCap: '$452.3B', volume: '3.2M', numAnalysts: 38,
    targetHigh: 630.00, targetLow: 430.00, volatility: 0.013, yearReturn: 0.22,
  },
  {
    ticker: 'NFLX', name: 'Netflix Inc.', sector: 'Communication',
    currentPrice: 658.40, priceTarget: 725.00, change24h: 1.12, pe: 44.8,
    recommendation: 'Buy', marketCap: '$289.4B', volume: '2.8M', numAnalysts: 42,
    targetHigh: 820.00, targetLow: 560.00, volatility: 0.020, yearReturn: 0.45,
  },
  {
    ticker: 'COST', name: 'Costco Wholesale', sector: 'Consumer Stap.',
    currentPrice: 1048.50, priceTarget: 1010.00, change24h: 0.52, pe: 54.6,
    recommendation: 'Hold', marketCap: '$465.2B', volume: '1.4M', numAnalysts: 22,
    targetHigh: 1150.00, targetLow: 890.00, volatility: 0.013, yearReturn: 0.20,
  },
  {
    ticker: 'CRM', name: 'Salesforce Inc.', sector: 'Technology',
    currentPrice: 276.80, priceTarget: 310.00, change24h: -0.78, pe: 41.3,
    recommendation: 'Buy', marketCap: '$265.1B', volume: '5.3M', numAnalysts: 40,
    targetHigh: 360.00, targetLow: 230.00, volatility: 0.018, yearReturn: -0.05,
  },
  {
    ticker: 'ADBE', name: 'Adobe Inc.', sector: 'Technology',
    currentPrice: 378.90, priceTarget: 425.00, change24h: -1.15, pe: 29.7,
    recommendation: 'Hold', marketCap: '$168.4B', volume: '3.8M', numAnalysts: 38,
    targetHigh: 500.00, targetLow: 320.00, volatility: 0.018, yearReturn: -0.10,
  },
  {
    ticker: 'INTC', name: 'Intel Corp.', sector: 'Technology',
    currentPrice: 21.40, priceTarget: 27.00, change24h: -2.08, pe: null,
    recommendation: 'Hold', marketCap: '$91.2B', volume: '47.8M', numAnalysts: 35,
    targetHigh: 38.00, targetLow: 18.00, volatility: 0.025, yearReturn: -0.40,
  },
  {
    ticker: 'AMD', name: 'Adv. Micro Devices', sector: 'Technology',
    currentPrice: 118.60, priceTarget: 155.00, change24h: 3.21, pe: 52.1,
    recommendation: 'Strong Buy', marketCap: '$192.4B', volume: '42.5M', numAnalysts: 45,
    targetHigh: 190.00, targetLow: 110.00, volatility: 0.022, yearReturn: 0.20,
  },
];

export const STOCKS: Stock[] = stockDefs.map(def => ({
  ticker: def.ticker,
  name: def.name,
  sector: def.sector,
  market: 'US' as const,
  currency: 'USD' as const,
  currentPrice: def.currentPrice,
  priceTarget: def.priceTarget,
  upside: parseFloat(((def.priceTarget - def.currentPrice) / def.currentPrice * 100).toFixed(1)),
  change24h: def.change24h,
  pe: def.pe,
  recommendation: def.recommendation,
  marketCap: def.marketCap,
  volume: def.volume,
  numAnalysts: def.numAnalysts,
  analystTargets: {
    high: def.targetHigh,
    low: def.targetLow,
    average: def.priceTarget,
  },
  historicalPrices: generateHistoricalPrices(def.ticker, def.currentPrice, def.yearReturn, def.volatility),
}));
