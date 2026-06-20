import React, { useEffect, useState, useCallback } from 'react';
import { X, Star, Trash2, TrendingUp, TrendingDown, RefreshCw, Loader2, BookmarkX } from 'lucide-react';
import { getWatchlist, removeFromWatchlist } from '../../api/client';
import { fmtMoney, Skeleton } from '../common/ui';

/* ===========================================================================
   Watchlist drawer — authenticated users' saved stocks + valuation snapshots.
   onSelect(ticker) re-runs the full analysis for a saved name.
   =========================================================================== */
const Watchlist = ({ open, onClose, onSelect }) => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getWatchlist();
      setItems(res.items || []);
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not load your watchlist.');
      setItems([]);
    }
  }, []);

  useEffect(() => { if (open) { setItems(null); load(); } }, [open, load]);

  const remove = async (ticker) => {
    setRemoving(ticker);
    try {
      await removeFromWatchlist(ticker);
      setItems((prev) => prev.filter((i) => i.ticker !== ticker));
    } catch (e) {
      setError('Failed to remove. Try again.');
    } finally {
      setRemoving(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-dhanam-panel shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-dhanam-accent" />
            <h3 className="text-lg font-semibold tracking-tight text-dhanam-text-hi">My Watchlist</h3>
            {items && <span className="tabular rounded-md bg-white/5 px-2 py-0.5 text-xs text-dhanam-text-mid">{items.length}</span>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} aria-label="Refresh" className="rounded-lg p-2 text-dhanam-text-mid hover:bg-white/5 hover:text-dhanam-text-hi">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-dhanam-text-mid hover:bg-white/5 hover:text-dhanam-text-hi">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="mb-3 rounded-lg border border-rose-900/30 bg-rose-900/10 px-3 py-2 text-sm text-dhanam-neg">{error}</div>}

          {items === null && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          )}

          {items && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookmarkX className="h-10 w-10 text-dhanam-text-lo" />
              <p className="mt-3 text-sm text-dhanam-text-mid">No saved stocks yet.</p>
              <p className="mt-1 text-xs text-dhanam-text-lo">Analyze a ticker and tap “Save” to add it here.</p>
            </div>
          )}

          {items && items.map((it) => {
            const snap = it.snapshot || {};
            const up = snap.upsidePct;
            return (
              <div key={it.ticker} className="bento mb-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => { onSelect?.(it.ticker); onClose?.(); }} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-dhanam-text-hi">{it.ticker}</span>
                      {it.exchange && <span className="text-[11px] text-dhanam-text-lo">{it.exchange}</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-dhanam-text-lo">Price</span>
                      <span className="tabular text-right text-dhanam-text-mid">{fmtMoney(snap.price, it.currency)}</span>
                      <span className="text-dhanam-text-lo">Fair Value</span>
                      <span className="tabular text-right text-dhanam-accent">{fmtMoney(snap.intrinsicValue, it.currency)}</span>
                      {up != null && (
                        <>
                          <span className="text-dhanam-text-lo">Upside</span>
                          <span className={`tabular flex items-center justify-end gap-1 text-right ${up >= 0 ? 'text-dhanam-pos' : 'text-dhanam-neg'}`}>
                            {up >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {up >= 0 ? '+' : ''}{Number(up).toFixed(1)}%
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                  <button onClick={() => remove(it.ticker)} disabled={removing === it.ticker}
                    aria-label={`Remove ${it.ticker}`}
                    className="rounded-lg p-2 text-dhanam-text-lo transition-colors hover:bg-rose-500/10 hover:text-dhanam-neg disabled:opacity-50">
                    {removing === it.ticker ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
};

export default Watchlist;
