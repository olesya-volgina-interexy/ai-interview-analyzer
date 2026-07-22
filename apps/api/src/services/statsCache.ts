import { redis } from '../db/redis';
import { describeError } from '../utils/errorLogger';

// In-process pub/sub so the live-updating dashboard (SSE, see
// routes/statsStream.ts) can push a "stats changed" event the moment the
// cache is invalidated, instead of the frontend only finding out on its next
// page load or poll. Single-process only — if the API ever runs as more
// than one instance behind a load balancer, this needs to move to Redis
// pub/sub so an invalidation on instance A also notifies clients connected
// to instance B.
type StatsChangeListener = () => void;
const listeners = new Set<StatsChangeListener>();

export function onStatsChanged(listener: StatsChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function invalidateStatsCache() {
  try {
    const keys = await redis.keys('stats:overview:*');
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    console.warn('[stage:statsCache] invalidation failed', describeError(err));
  }

  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn('[stage:statsCache] listener failed', describeError(err));
    }
  }
}
