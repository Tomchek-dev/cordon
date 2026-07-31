'use client';

import { useEffect, useState } from 'react';
import { type DailyReport, fetchMe, fetchReports, generateReportNow } from '@/lib/api';

export function ReportsPanel({ onClose }: { onClose: () => void }) {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReports().then(setReports);
    fetchMe().then((me) => setCanGenerate(me.role === 'ADMIN' || me.role === 'MOD'));
  }, []);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const report = await generateReportNow();
      setReports((prev) => [report, ...prev]);
      setExpandedId(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Daily Reports</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            ✕
          </button>
        </div>

        <div className="mb-4 flex-1 space-y-2 overflow-y-auto">
          {reports.length === 0 && <p className="text-xs text-neutral-600">No reports yet.</p>}
          {reports.map((report) => (
            <div key={report.id} className="rounded border border-neutral-800">
              <button
                onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800/50"
              >
                <span>{new Date(report.date).toLocaleDateString()}</span>
                <span className="text-xs text-neutral-500">
                  {expandedId === report.id ? 'Hide' : 'View'}
                </span>
              </button>
              {expandedId === report.id && (
                <pre className="whitespace-pre-wrap border-t border-neutral-800 px-3 py-2 text-xs text-neutral-300">
                  {report.content}
                </pre>
              )}
            </div>
          ))}
        </div>

        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

        {canGenerate && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full rounded bg-indigo-600 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate report now'}
          </button>
        )}
      </div>
    </div>
  );
}
