export interface ToastItem {
  id: string;
  channelId: string;
  title: string;
  preview: string;
  kind: 'message' | 'mention' | 'reminder' | 'call';
}

const KIND_ICON: Record<ToastItem['kind'], string> = {
  message: '💬',
  mention: '📣',
  reminder: '⏰',
  call: '📞',
};

export function ToastStack({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-30 flex w-72 flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => onOpen(toast.id)}
          className="flex items-start gap-2 rounded border border-term-line bg-term-panel p-3 text-left shadow-lg hover:border-term-green-dim"
        >
          <span>{KIND_ICON[toast.kind]}</span>
          <span className="flex-1 overflow-hidden">
            <span className="block text-xs font-semibold text-term-green-bright">{toast.title}</span>
            <span className="block truncate text-xs text-term-muted">{toast.preview}</span>
          </span>
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(toast.id);
            }}
            className="text-term-muted hover:text-term-green-bright"
          >
            ✕
          </span>
        </button>
      ))}
    </div>
  );
}
