'use client';

import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Brain, ChevronDown, ChevronUp, RefreshCw, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SECFiling } from '@/app/api/stocks/[ticker]/sec/route';

interface SECFilingsProps {
  ticker: string;
}

interface FilingAnalysis {
  analysis: string;
  cached: boolean;
}

const FORM_COLORS: Record<string, string> = {
  '10-K': 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  '10-Q': 'bg-blue-500/15 text-blue-500 border-blue-500/30',
};

function formatDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function FilingRow({ filing, ticker }: { filing: SECFiling; ticker: string }) {
  const [expanded, setExpanded] = useState(false);
  const [analysisData, setAnalysisData] = useState<FilingAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/stocks/${ticker}/sec/analyze`, window.location.origin);
      url.searchParams.set('accession', filing.accessionNumber);
      url.searchParams.set('form', filing.form);
      url.searchParams.set('date', filing.filingDate);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Error ' + res.status);
      const data: FilingAnalysis = await res.json();
      setAnalysisData(data);
      setExpanded(true);
    } catch {
      setError('No se pudo generar el análisis. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    if (analysisData) {
      setExpanded(v => !v);
    } else {
      fetchAnalysis();
    }
  };

  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900">
        {/* Form badge */}
        <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded border ${FORM_COLORS[filing.form] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
          {filing.form}
        </span>

        {/* Date */}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-mono">
          {formatDate(filing.filingDate)}
        </span>

        <div className="flex-1" />

        {/* View on SEC */}
        <a
          href={filing.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-colors px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <ExternalLink size={12} />
          <span className="hidden sm:inline">Ver en SEC</span>
        </a>

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            analysisData
              ? 'bg-violet-500/15 text-violet-500 hover:bg-violet-500/25'
              : 'bg-violet-600 text-white hover:bg-violet-700'
          }`}
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Brain size={12} />
          )}
          {loading ? 'Analizando...' : analysisData ? (expanded ? 'Ocultar' : 'Ver análisis') : 'Analizar con IA'}
          {analysisData && !loading && (
            expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />
          )}
        </button>
      </div>

      {/* Analysis panel */}
      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/20 text-xs text-red-500">
          {error}
          <button onClick={fetchAnalysis} className="ml-2 underline hover:no-underline">Reintentar</button>
        </div>
      )}

      {analysisData && expanded && (
        <div className="px-4 py-4 bg-gradient-to-br from-violet-50/80 to-blue-50/80 dark:from-violet-950/20 dark:to-blue-950/20 border-t border-violet-100 dark:border-violet-900/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain size={13} className="text-violet-500" />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Análisis IA · {filing.form} {filing.filingDate}</span>
              <span className="text-xs bg-violet-500/10 text-violet-500 px-1.5 py-0.5 rounded">Claude Sonnet</span>
            </div>
            <div className="flex items-center gap-2">
              {analysisData.cached && <span className="text-xs text-gray-400">caché</span>}
              <button
                onClick={fetchAnalysis}
                disabled={loading}
                className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-gray-400 hover:text-violet-500 transition-colors"
                title="Regenerar análisis"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 dark:text-white mt-4 mb-2 first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 dark:text-white mt-4 mb-1.5 first:mt-0 border-b border-violet-200 dark:border-violet-800/40 pb-1">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">{children}</h3>,
              p: ({ children }) => <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
              em: ({ children }) => <em className="italic text-gray-600 dark:text-gray-400">{children}</em>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              hr: () => <hr className="my-3 border-violet-200 dark:border-violet-800/40" />,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-violet-400 pl-3 italic text-gray-600 dark:text-gray-400 my-2">{children}</blockquote>,
              code: ({ children }) => <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
            }}
          >
            {analysisData.analysis}
          </ReactMarkdown>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Solo con fines informativos. No constituye asesoramiento financiero.
          </p>
        </div>
      )}
    </div>
  );
}

export default function SECFilings({ ticker }: SECFilingsProps) {
  const [filings, setFilings] = useState<SECFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setFilings([]);

    fetch(`/api/stocks/${ticker}/sec`)
      .then(r => { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); })
      .then((data: SECFiling[]) => setFilings(data))
      .catch(() => setError('No se pudieron cargar los reportes SEC.'))
      .finally(() => setLoading(false));
  }, [ticker]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <FileText size={15} className="text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reportes SEC (10-Q / 10-K)</h3>
        {filings.length > 0 && (
          <span className="text-xs bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded-full font-medium">
            {filings.length}
          </span>
        )}
        <div className="flex-1" />
        <a
          href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=10-Q&dateb=&owner=include&count=40`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-blue-500 transition-colors flex items-center gap-1"
        >
          <ExternalLink size={11} />
          Ver todos en EDGAR
        </a>
      </div>

      <div className="p-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
            <Loader2 size={16} className="animate-spin text-blue-500" />
            <span className="text-sm">Cargando reportes SEC...</span>
          </div>
        )}

        {error && (
          <p className="text-center text-sm text-red-400 py-6">{error}</p>
        )}

        {!loading && !error && filings.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-6">No se encontraron reportes para {ticker}.</p>
        )}

        {!loading && !error && filings.map(filing => (
          <FilingRow key={filing.accessionNumber} filing={filing} ticker={ticker} />
        ))}
      </div>

      {!loading && filings.length > 0 && (
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
          Fuente: SEC EDGAR · Reportes 10-Q (trimestral) y 10-K (anual)
        </div>
      )}
    </div>
  );
}
