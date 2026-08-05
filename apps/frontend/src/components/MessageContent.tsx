const MENTION_PATTERN = /@([a-zA-Z0-9_]+)/g;

export function MessageContent({ content }: { content: string }) {
  const parts = content.split(MENTION_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-term-green-dim/20 px-1 text-term-green-bright">
            @{part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
