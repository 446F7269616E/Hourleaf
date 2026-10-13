/** Sizes a scrollable column to its actual visible space without moving its neighbor. */
export function mountViewportScrollPanel(panel: HTMLElement): () => void {
  const desktop = window.matchMedia("(min-width: 861px)");
  let frame: number | undefined;
  let disposed = false;
  let lastHeight: number | undefined;
  const measure = () => {
    frame = undefined;
    if (disposed || !panel.isConnected) return;
    if (!desktop.matches) {
      panel.style.removeProperty("--options-sidebar-height");
      lastHeight = undefined;
      return;
    }
    const stickyTop = Number.parseFloat(window.getComputedStyle(panel).top) || 0;
    // A short detail pane may make the column determine document height. Bound
    // growth at the sticky offset so page scrolling cannot keep extending it.
    const top = Math.max(stickyTop, panel.getBoundingClientRect().top);
    const height = Math.max(0, Math.floor(window.innerHeight - top - 16));
    if (height !== lastHeight) {
      panel.style.setProperty("--options-sidebar-height", `${height}px`);
      lastHeight = height;
    }
  };
  const schedule = () => {
    if (!disposed && frame === undefined) frame = window.requestAnimationFrame(measure);
  };
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, { passive: true });
  desktop.addEventListener("change", schedule);
  const observer = new ResizeObserver(schedule);
  observer.observe(panel);
  measure();
  return () => {
    disposed = true;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule);
    desktop.removeEventListener("change", schedule);
  };
}
