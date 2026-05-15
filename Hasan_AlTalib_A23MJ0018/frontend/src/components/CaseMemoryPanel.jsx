import { useEffect, useState } from 'react';
import { Clock3, History, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import Badge from './Badge';
import LoadingSkeleton from './LoadingSkeleton';
import { getSimilarIncidents } from '../lib/api';

function formatResolvedDaysAgo(value) {
  if (!value) return 'Resolved date unavailable';

  const resolvedAt = new Date(value);
  if (Number.isNaN(resolvedAt.getTime())) {
    return 'Resolved date unavailable';
  }

  const deltaMs = Date.now() - resolvedAt.getTime();
  const deltaDays = Math.max(0, Math.floor(deltaMs / (1000 * 60 * 60 * 24)));

  if (deltaDays === 0) return 'Resolved today';
  if (deltaDays === 1) return 'Resolved 1 day ago';
  return `Resolved ${deltaDays} days ago`;
}

export default function CaseMemoryPanel({ incidentId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadSimilarCases() {
      setLoading(true);
      setError('');

      try {
        const response = await getSimilarIncidents(incidentId);
        if (active) {
          setItems(Array.isArray(response) ? response : []);
        }
      } catch (fetchError) {
        if (active) {
          setError(fetchError.message || 'Case memory unavailable');
          setItems([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSimilarCases();

    return () => {
      active = false;
    };
  }, [incidentId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History size={16} aria-hidden="true" />
          Case Memory
        </CardTitle>
        {!loading && !error && items.some((item) => item.cragUsed) && (
          <p className="text-xs text-amber-600">
            Query reformulated for better results
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-[6px] border border-[var(--border)] p-4">
                <LoadingSkeleton height={12} width="28%" />
                <LoadingSkeleton className="mt-3" height={18} width="72%" />
                <LoadingSkeleton className="mt-3" height={14} width="100%" />
                <LoadingSkeleton className="mt-2" height={14} width="88%" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-[var(--text-2)]">Case memory unavailable</p>
        )}

        {!loading && !error && !items.length && (
          <p className="text-sm text-[var(--text-2)]">No similar cases found</p>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item._id} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="type" value={item.type} />
                  <span className="rounded-[2px] border border-[var(--accent-blue)]/30 bg-[rgb(59,130,246,0.12)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--accent-blue)]">
                    {Math.round((Number(item.similarity) || 0) * 100)}% similar
                  </span>
                </div>

                <p className="mt-3 text-sm font-medium text-[var(--text-1)]">
                  {item.title || 'Resolved incident'}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">
                  {item.resolutionNote || 'Resolution note unavailable'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-3)]">
                  {item.location && <span>{item.location}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={12} aria-hidden="true" />
                    {formatResolvedDaysAgo(item.resolvedAt)}
                  </span>
                  <Link
                    to={`/incidents/${item._id}`}
                    className="inline-flex items-center gap-1 text-[var(--accent-blue)] hover:underline"
                  >
                    <LinkIcon size={12} aria-hidden="true" />
                    Open case
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
