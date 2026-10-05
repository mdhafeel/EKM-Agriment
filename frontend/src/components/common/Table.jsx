import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export default function Table({
  columns, data, loading, emptyMessage = 'No records found',
  onSort, sortKey, sortDir,
}) {
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    /* relative wrapper lets us show the fade-right scroll hint */
    <div className="relative">
      {/* Scroll hint — fades in on mobile to indicate horizontal scroll */}
      <div className="pointer-events-none absolute top-0 right-0 h-full w-8
        bg-gradient-to-l from-white/80 to-transparent z-10 sm:hidden" />

      <div className="overflow-x-auto -mx-0 scrollbar-thin">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map(col => (
                <th
                  key={col.key || col.label}
                  className={`text-left px-3 sm:px-4 py-3 font-semibold text-gray-600 whitespace-nowrap
                    ${col.sortable ? 'cursor-pointer hover:text-gray-900 select-none' : ''}
                    ${col.className || ''}
                    ${col.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      sortKey === col.key
                        ? (sortDir === 'asc'
                          ? <ChevronUp size={14} className="text-indigo-600" />
                          : <ChevronDown size={14} className="text-indigo-600" />)
                        : <ChevronsUpDown size={14} className="opacity-40" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-gray-50 transition-colors">
                  {columns.map(col => (
                    <td
                      key={col.key || col.label}
                      className={`px-3 sm:px-4 py-3
                        ${col.className || ''}
                        ${col.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                    >
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
