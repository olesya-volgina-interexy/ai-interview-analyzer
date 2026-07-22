import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { statsApi } from '@/api/client';

// Keeps dashboard stats fresh without a manual page reload. Opens an SSE
// connection to /stats/stream and invalidates every ['stats', ...] query
// the instant the backend reports a change (see statsCache.ts::onStatsChanged) —
// e.g. a Linear ticket's status changes, so its new position/time-on-stage
// shows up within moments instead of only after the visitor happens to
// refresh. The browser's EventSource auto-reconnects on its own if the
// connection drops; if SSE is ever unavailable for some reason, the
// queries' own refetchInterval polling still keeps data reasonably fresh.
export function useStatsLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const url = statsApi.getStreamUrl();
    if (!url) return;

    const source = new EventSource(url);
    source.addEventListener('stats-changed', () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    });

    return () => source.close();
  }, [queryClient]);
}
