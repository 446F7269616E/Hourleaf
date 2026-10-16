/** Sizes a scrollable column to its actual visible space without moving its neighbor. */
export function mountViewportScrollPanel(panel: HTMLElement): () => void {
  const documentFlow = window.matchMedia("(max-width: 860px), (max-height: 360px)");
  const workspace = panel.parentElement;
  const shell = panel.closest<HTMLElement>(".app-shell");
  const navigation = shell?.querySelector<HTMLElement>(".app-navigation");
  const viewport = window.visualViewport;
  let frame: number | undefined;
  let disposed = false;
  let lastHeight: number | undefined;
  let lastTop: number | undefined;
  const measure = () => {
    frame = undefined;
    if (disposed || !panel.isConnected) return;
    if (documentFlow.matches) {
      panel.style.removeProperty("--options-sidebar-height");
      panel.style.removeProperty("--options-sidebar-top");
      lastHeight = undefined;
      lastTop = undefined;
      return;
    }
    const style = window.getComputedStyle(panel);
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    const navigationTop = navigation
      ? Number.parseFloat(window.getComputedStyle(navigation).top) || 0
      : 0;
    const stickyTop = navigation
      ? Math.ceil(viewportTop + navigationTop + navigation.getBoundingClientRect().height + 12)
      : Number.parseFloat(style.top) || 0;
    // At the end of the document, the sticky element cannot extend past its
    // containing grid. Reserve the shell's trailing padding so it never gets
    // pushed above its top inset when the right-hand content reaches the end.
    const bottomGap = Math.max(
      16,
      shell ? Number.parseFloat(window.getComputedStyle(shell).paddingBottom) || 0 : 0
    );
    // Read the grid's natural top, not the sticky element's displaced position;
    // using the latter feeds container-boundary movement back into its height.
    const top = Math.max(stickyTop, workspace?.getBoundingClientRect().top ?? stickyTop);
    const maximumHeight = Math.max(0, viewportBottom - stickyTop - bottomGap);
    const height = Math.floor(
      Math.min(maximumHeight, Math.max(160, viewportBottom - top - bottomGap))
    );
    if (stickyTop !== lastTop) {
      panel.style.setProperty("--options-sidebar-top", `${stickyTop}px`);
      lastTop = stickyTop;
    }
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
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  documentFlow.addEventListener("change", schedule);
  const observer = new ResizeObserver(schedule);
  for (const target of new Set([panel, workspace, shell, navigation])) {
    if (target) observer.observe(target);
  }
  measure();
  return () => {
    disposed = true;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    documentFlow.removeEventListener("change", schedule);
  };
}
