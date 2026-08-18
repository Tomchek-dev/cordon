import type { MessageCard } from '@/lib/api';

function CardThumbnail({ imageUrl }: { imageUrl?: string }) {
  if (!imageUrl) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-term-input text-term-muted">
        🖼️
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, hotlinked source images
    <img src={imageUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
  );
}

function CardBody({ card }: { card: MessageCard }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 text-sm font-medium text-term-green-bright">{card.title}</p>
      {card.subtitle && <p className="mt-0.5 truncate text-xs text-term-muted">{card.subtitle}</p>}
    </div>
  );
}

const CARD_CLASSES =
  'flex items-center gap-3 rounded-md border border-term-line bg-term-bg/40 p-2 transition-colors hover:border-term-green-dim hover:bg-term-input/60';

export function MessageCards({ cards }: { cards: MessageCard[] }) {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {cards.map((card, index) =>
        card.url ? (
          <a key={index} href={card.url} target="_blank" rel="noopener noreferrer" className={CARD_CLASSES}>
            <CardThumbnail imageUrl={card.imageUrl} />
            <CardBody card={card} />
          </a>
        ) : (
          <div key={index} className={CARD_CLASSES}>
            <CardThumbnail imageUrl={card.imageUrl} />
            <CardBody card={card} />
          </div>
        ),
      )}
    </div>
  );
}
