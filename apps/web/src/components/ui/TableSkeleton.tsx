import { Skeleton } from '@/components/ui/skeleton';

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {[...Array(rows)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
    </div>
  );
}
