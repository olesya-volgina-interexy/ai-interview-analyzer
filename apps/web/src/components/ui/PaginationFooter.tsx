interface PaginationFooterProps {
  page: number;
  hasNext: boolean;
  onPageChange: (page: number) => void;
}

export function PaginationFooter({ page, hasNext, onPageChange }: PaginationFooterProps) {
  return (
    <div className="flex items-center justify-center gap-3 p-3 border-t border-slate-100">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Previous
      </button>
      <span className="text-sm text-slate-400">Page {page}</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNext}
        className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}
