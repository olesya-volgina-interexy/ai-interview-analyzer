import { useRef, useState, Children, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * On phones: a swipeable, snap-scrolling row of cards with no visible scrollbar
 * and dot indicators below. On tablet+ it falls back to a normal grid.
 */
export function CardCarousel({
  children,
  gridClass = 'sm:grid-cols-2',
}: {
  children: ReactNode;
  gridClass?: string;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const multi = items.length > 1;

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const base = el.getBoundingClientRect().left;
    let nearest = 0;
    let min = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const d = Math.abs((c as HTMLElement).getBoundingClientRect().left - base);
      if (d < min) { min = d; nearest = i; }
    });
    setActive(nearest);
  };

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const kid = el.children[i] as HTMLElement | undefined;
    if (!kid) return;
    el.scrollTo({
      left: el.scrollLeft + (kid.getBoundingClientRect().left - el.getBoundingClientRect().left),
      behavior: 'smooth',
    });
  };

  return (
    <div>
      <div
        ref={ref}
        onScroll={handleScroll}
        className={cn(
          'flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory [&>*]:snap-start',
          multi && '[&>*]:flex-shrink-0 [&>*]:w-[85%]',
          'sm:grid sm:gap-4 sm:overflow-visible sm:snap-none sm:[&>*]:w-auto',
          gridClass,
        )}
      >
        {children}
      </div>

      {multi && (
        <div className="flex justify-center gap-1.5 mt-2 sm:hidden">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to card ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === active ? 'w-4 bg-[#5067F4]' : 'w-1.5 bg-slate-300',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
