import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  // On mobile (< sm) all modals go full width; on sm+ respect the size cap
  const sizes = {
    sm:   'sm:max-w-md',
    md:   'sm:max-w-2xl',
    lg:   'sm:max-w-4xl',
    xl:   'sm:max-w-6xl',
    full: 'sm:max-w-7xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-16 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className={`relative bg-white w-full ${sizes[size] || sizes.md}
        rounded-t-2xl sm:rounded-2xl shadow-2xl my-0 sm:my-4 mx-0 sm:mx-4
        max-h-[95vh] sm:max-h-[90vh] flex flex-col`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 pr-2">{title}</h2>
          <button onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
