import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './DepthCarousel.css';
export interface DepthCarouselItem { id?: string; image?: string; alt?: string; content?: ReactNode; }
interface DepthCarouselProps { items?: Array<string | DepthCarouselItem>; className?: string; ariaLabel?: string; }
export default function DepthCarousel({ items, className = '', ariaLabel = 'Depth carousel' }: DepthCarouselProps) {
  const data = useMemo(() => (items ?? []).map(item => typeof item === 'string' ? { image: item } : item), [items]);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => { setActive(0); if (track.current) track.current.scrollLeft = 0; }, [data]);
  function navigate(index: number) {
    if (!data.length) return;
    const next = (index + data.length) % data.length;
    const el = track.current;
    const card = el?.children[next] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft - (el.clientWidth - card.clientWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    setActive(next);
  }
  if (!data.length) return null;
  return (
    <div className={`depth-carousel ${className}`} role="group" aria-roledescription="carousel" aria-label={ariaLabel}
      tabIndex={0} onKeyDown={event => {
        if ((event.target as HTMLElement).closest('summary, button')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); navigate(active + (event.key === 'ArrowLeft' ? -1 : 1));
        }
      }}>
      <div className="depth-carousel__stage" ref={track} onScroll={() => {
        const el = track.current;
        if (!el) return;
        const center = el.scrollLeft + el.clientWidth / 2;
        let nearest = 0, distance = Infinity;
        Array.from(el.children).forEach((child, index) => {
          const card = child as HTMLElement;
          const delta = Math.abs(card.offsetLeft - el.offsetLeft + card.clientWidth / 2 - center);
          if (delta < distance) { nearest = index; distance = delta; }
        });
        setActive(nearest);
      }}>
        {data.map((item, index) => (
          <div key={item.id ?? index} className="depth-carousel__card" data-active={active === index}
            aria-roledescription="slide" aria-label={`${index + 1} of ${data.length}`}>
            {item.content ?? (item.image ? <img className="depth-carousel__img" src={item.image} alt={item.alt ?? ''} loading="lazy" /> : null)}
          </div>
        ))}
      </div>
      {data.length > 1 && <div className="depth-carousel__controls">
        <button type="button" className="depth-carousel__arrow" aria-label="Previous slide" onClick={() => navigate(active - 1)}>←</button>
        <span aria-live="polite" aria-atomic="true">{active + 1} / {data.length}</span>
        <button type="button" className="depth-carousel__arrow" aria-label="Next slide" onClick={() => navigate(active + 1)}>→</button>
      </div>}
    </div>
  );
}
