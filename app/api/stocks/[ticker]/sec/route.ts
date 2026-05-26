import { NextRequest, NextResponse } from 'next/server';

export const TICKER_TO_CIK: Record<string, string> = {
  AAPL:  '0000320193',
  MSFT:  '0000789019',
  NVDA:  '0001045810',
  TSLA:  '0001318605',
  AMZN:  '0001018724',
  META:  '0001326801',
  GOOGL: '0001652044',
  'BRK-B': '0001067983',
  JPM:   '0000019617',
  JNJ:   '0000200406',
  V:     '0001403161',
  WMT:   '0000104169',
  PG:    '0000080424',
  MA:    '0001141391',
  NFLX:  '0001065280',
  COST:  '0000909832',
  CRM:   '0001108524',
  ADBE:  '0000796343',
  INTC:  '0000050863',
  AMD:   '0000002488',
};

export interface SECFiling {
  accessionNumber: string;
  filingDate: string;
  form: string;
  primaryDocument: string;
  secUrl: string;
  documentUrl: string;
}

interface CacheEntry { data: SECFiling[]; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 6 * 60 * 60 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const cik = TICKER_TO_CIK[ticker.toUpperCase()];

  if (!cik) {
    return NextResponse.json({ error: 'CIK not found for ticker' }, { status: 404 });
  }

  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const cikNum = cik.replace(/^0+/, '');
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { 'User-Agent': 'StockVision/1.0 marco.aedoa@gmail.com' },
      next: { revalidate: 21600 },
    });

    if (!res.ok) throw new Error('EDGAR API error ' + res.status);

    const subData = await res.json();
    const recent = subData.filings?.recent ?? {};

    const forms: string[]       = recent.form ?? [];
    const dates: string[]       = recent.filingDate ?? [];
    const accessions: string[]  = recent.accessionNumber ?? [];
    const docs: string[]        = recent.primaryDocument ?? [];

    const filings: SECFiling[] = [];

    for (let i = 0; i < forms.length && filings.length < 8; i++) {
      if (forms[i] !== '10-Q' && forms[i] !== '10-K') continue;

      const accession = accessions[i];
      const accessionFormatted = accession.replace(/-/g, '');
      const doc = docs[i];

      filings.push({
        accessionNumber: accession,
        filingDate: dates[i],
        form: forms[i],
        primaryDocument: doc,
        secUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikNum}&type=${forms[i]}&dateb=&owner=include&count=10`,
        documentUrl: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionFormatted}/${doc}`,
      });
    }

    cache.set(ticker, { data: filings, timestamp: Date.now() });
    return NextResponse.json(filings);
  } catch (error) {
    console.error(`SEC error for ${ticker}:`, error);
    return NextResponse.json({ error: 'Failed to fetch SEC filings' }, { status: 500 });
  }
}
