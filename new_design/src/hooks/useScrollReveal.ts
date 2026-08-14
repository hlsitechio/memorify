import { useEffect, useRef, useState } from "react";

type ScrollRevealOptions = {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
  delay?: number;
};

/**
 * Hook for scroll-triggered animations using IntersectionObserver
 * Respects prefers-reduced-motion
 */
export function useScrollReveal(options: ScrollRevealOptions = {}) {
  const {
    threshold = 0.1,
    rootMargin = "0px 0px -50px 0px",
    triggerOnce = true,
    delay = 0,
  } = options;

  const elementRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const element = elementRef.current;
    if (!element) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay > 0) {
            setTimeout(() => setIsVisible(true), delay);
          } else {
            setIsVisible(true);
          }
          if (triggerOnce && observerRef.current) {
            observerRef.current.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [threshold, rootMargin, triggerOnce, delay]);

  return { ref: elementRef, isVisible };
}

/**
 * Hook for staggered children animations
 */
export function useStaggeredReveal(
  count: number,
  options: ScrollRevealOptions = {}
) {
  const { threshold = 0.1, rootMargin = "0px 0px -50px 0px", delay = 0 } =
    options;

  const containerRef = useRef<HTMLElement | null>(null);
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setVisibleIndices(new Set(Array.from({ length: count }, (_, i) => i)));
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Stagger the reveal
          Array.from({ length: count }, (_, i) => i).forEach((i) => {
            setTimeout(() => {
              setVisibleIndices((prev) => new Set([...prev, i]));
            }, delay + i * 80);
          });
          if (observerRef.current) {
            observerRef.current.unobserve(container);
          }
        }
      },
      { threshold, rootMargin }
    );

    observerRef.current.observe(container);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [count, threshold, rootMargin, delay]);

  return { containerRef, visibleIndices };
}

/**
 * Hook for scroll progress (0-1)
 */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollTop / docHeight);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return progress;
}

/**
 * Hook for element in viewport (simple boolean)
 */
export function useInView(
  options: IntersectionObserverInit = { threshold: 0.1 }
) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      options
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [options]);

  return { ref, inView };
}