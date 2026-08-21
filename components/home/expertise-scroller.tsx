"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type ExpertiseScrollerProps = {
  children: ReactNode;
};

export function ExpertiseScroller({ children }: ExpertiseScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);

  const updateControls = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    const maximumScroll = scroller.scrollWidth - scroller.clientWidth;
    setCanScrollPrevious(scroller.scrollLeft > 2);
    setCanScrollNext(scroller.scrollLeft < maximumScroll - 2);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    updateControls();
    scroller.addEventListener("scroll", updateControls, { passive: true });
    window.addEventListener("resize", updateControls, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", updateControls);
      window.removeEventListener("resize", updateControls);
    };
  }, [updateControls]);

  function moveCards(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    const firstCard = scroller?.querySelector<HTMLElement>("[data-expertise-card]");

    if (!scroller || !firstCard) {
      return;
    }

    const list = firstCard.parentElement;
    const gap = list ? Number.parseFloat(window.getComputedStyle(list).columnGap) || 0 : 0;

    scroller.scrollBy({
      left: direction * (firstCard.offsetWidth + gap),
      behavior: "smooth",
    });
  }

  return (
    <>
      <div className="mx-auto mt-10 flex max-w-[1280px] items-center justify-end gap-4 px-[18px] sm:px-6 md:mt-14 lg:px-8">
        <p id="expertise-scroll-help" className="mr-1 hidden text-xs font-semibold tracking-[0.14em] text-white/55 uppercase sm:block">
          Faites défiler
        </p>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-white/25 text-white transition-colors hover:border-sky-300 hover:bg-sky-300 hover:text-[#101f33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/25 disabled:hover:bg-transparent sm:size-12"
          aria-label="Voir l’expertise précédente"
          onClick={() => moveCards(-1)}
          disabled={!canScrollPrevious}
        >
          <span className="text-xl leading-none" aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-sky-300 bg-sky-300 text-[#101f33] transition-colors hover:bg-white hover:text-[#101f33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/25 sm:size-12"
          aria-label="Voir l’expertise suivante"
          onClick={() => moveCards(1)}
          disabled={!canScrollNext}
        >
          <span className="text-xl leading-none" aria-hidden="true">→</span>
        </button>
      </div>

      <div
        ref={scrollerRef}
        className="mt-5 w-full snap-x snap-mandatory scroll-pl-[calc((100vw-var(--expertise-card-width))/2)] overflow-x-auto overscroll-x-contain scroll-smooth pb-2 [--expertise-card-width:min(78vw,300px)] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-300 sm:[--expertise-card-width:min(45vw,300px)] md:[--expertise-card-width:min(34vw,300px)] lg:[--expertise-card-width:260px] xl:[--expertise-card-width:280px] [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-label="Galerie des domaines d’expertise"
        aria-describedby="expertise-scroll-help"
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}
