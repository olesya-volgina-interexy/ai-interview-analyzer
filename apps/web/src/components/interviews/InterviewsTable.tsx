export function InterviewsTable({
  data,
  isLoading,
  onRowClick,
}: {
  data: unknown[];
  isLoading: boolean;
  onRowClick: (id: string) => void;
}) {
  if (isLoading) return <div className="text-sm text-slate-500">Loading...</div>;
  return (
    <div className="rounded border p-4 text-sm text-slate-500">
      InterviewsTable — TODO ({data.length} rows)
    </div>
  );
}
