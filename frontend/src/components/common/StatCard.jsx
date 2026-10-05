export default function StatCard({ title, value, subtitle, onClick }) {
  return (
    <div
      className={`bg-white rounded-xl p-5 shadow-sm border border-gray-100 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}
