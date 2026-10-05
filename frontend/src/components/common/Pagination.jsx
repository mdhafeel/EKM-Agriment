import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, total, limit, onPageChange }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  const delta = 1;
  const pages = [];
  for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) pages.push(i);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-white">
      <p className="text-sm text-gray-500 order-2 sm:order-1">
        Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </p>
      <div className="flex items-center gap-1 order-1 sm:order-2">
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
          <ChevronLeft size={16} />
        </button>

        {page > 2 && (
          <>
            <button onClick={() => onPageChange(1)} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">1</button>
            {page > 3 && <span className="text-gray-400 px-1">…</span>}
          </>
        )}

        {pages.map(p => (
          <button key={p} onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 rounded-lg text-sm transition
              ${p === page ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
            {p}
          </button>
        ))}

        {page < totalPages - 1 && (
          <>
            {page < totalPages - 2 && <span className="text-gray-400 px-1">…</span>}
            <button onClick={() => onPageChange(totalPages)} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">{totalPages}</button>
          </>
        )}

        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
