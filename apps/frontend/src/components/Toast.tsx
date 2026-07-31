export interface ToastItem {
  id: string;
  channelId: string;
  title: string;
  preview: string;
  kind: 'message' | 'mention' | 'reminder';
}

const KIND_ICON: Record<ToastItem['kind'], string> = {
  message: '💬',
  mention: '📣',
  reminder: '⏰',
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
          className="flex items-start gap-2 rounded border border-neutral-700 bg-neutral-800 p-3 text-left shadow-lg hover:border-neutral-500"
        >
          <span>{KIND_ICON[toast.kind]}</span>
          <span className="flex-1 overflow-hidden">
            <span className="block text-xs font-semibold text-neutral-200">{toast.title}</span>
            <span className="block truncate text-xs text-neutral-400">{toast.preview}</span>
          </span>
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(toast.id);
            }}
            className="text-neutral-500 hover:text-neutral-300"
          >
            ✕
          </span>
        </button>
      ))}
    </div>
  );
}
