import type { LocalPageRules } from "../modules/local/types";

const STYLE_ID = "hourleaf-local-module-style";
type ShadowRule = NonNullable<LocalPageRules["shadowRules"]>[number];

/** Applies only declarative module CSS, including explicitly opted-in open roots. */
export class LocalPageRuleController {
  private rules: ShadowRule[] = [];
  private signature = "";
  private hosts = new Set<Element>();
  private styles = new Map<Document | ShadowRoot, HTMLStyleElement>();
  private observer: MutationObserver | null = null;
  private eventCleanups: Array<() => void> = [];

  constructor(private readonly document: Document) {}

  apply(rules: LocalPageRules): void {
    this.setStyle(this.document, ruleCss(rules));
    const nextRules = (rules.shadowRules ?? []).filter((rule) => ruleCss(rule).trim());
    const signature = JSON.stringify(nextRules);
    if (signature !== this.signature) {
      this.disconnect();
      this.signature = signature;
      this.rules = nextRules;
      this.hosts.clear();
      if (this.rules.length) this.observe();
    }
    this.discover(this.document);
    this.refreshRoots();
  }

  stop(): void {
    this.disconnect();
    for (const style of this.styles.values()) style.remove();
    this.styles.clear();
    this.hosts.clear();
    this.rules = [];
    this.signature = "";
  }

  private setStyle(root: Document | ShadowRoot, css: string): void {
    let style = this.styles.get(root);
    if (!css.trim()) {
      style?.remove();
      this.styles.delete(root);
      return;
    }
    if (!style) {
      style = this.document.createElement("style");
      style.id = STYLE_ID;
      this.styles.set(root, style);
    }
    if (style.textContent !== css) style.textContent = css;
    const parent =
      root === this.document ? (this.document.head ?? this.document.documentElement) : root;
    if (style.parentNode !== parent) parent.appendChild(style);
  }

  private discover(scope: ParentNode): void {
    for (const rule of this.rules) {
      try {
        if (scope instanceof Element && scope.matches(rule.hostSelector)) this.hosts.add(scope);
        for (const host of scope.querySelectorAll(rule.hostSelector)) this.hosts.add(host);
      } catch {
        // Malformed/unsupported selectors fail open, independently of other rules.
      }
    }
  }

  private refreshRoots(): void {
    const activeRoots = new Set<ShadowRoot>();
    for (const host of this.hosts) {
      if (!host.isConnected) {
        this.hosts.delete(host);
        continue;
      }
      const root = host.shadowRoot;
      if (!root) continue;
      const css = this.rules
        .filter((rule) => {
          try {
            return host.matches(rule.hostSelector);
          } catch {
            return false;
          }
        })
        .map(ruleCss)
        .join("\n\n");
      activeRoots.add(root);
      this.setStyle(root, css);
    }
    for (const [root, style] of this.styles) {
      if (root !== this.document && !activeRoots.has(root as ShadowRoot)) {
        style.remove();
        this.styles.delete(root);
      }
    }
  }

  private observe(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element && node.id !== STYLE_ID) this.discover(node);
        }
      }
      this.refreshRoots();
    });
    this.observer.observe(this.document.documentElement, { childList: true, subtree: true });
    const events = new Set(
      this.rules.flatMap((rule) => (rule.mountEvent ? [rule.mountEvent] : []))
    );
    for (const event of events) {
      const refresh = (): void => {
        this.discover(this.document);
        this.refreshRoots();
      };
      for (const target of [this.document, this.document.defaultView]) {
        if (!target) continue;
        target.addEventListener(event, refresh);
        this.eventCleanups.push(() => target.removeEventListener(event, refresh));
      }
    }
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const cleanup of this.eventCleanups) cleanup();
    this.eventCleanups = [];
  }
}

function ruleCss(rule: { css: string; hideSelectors: string[] }): string {
  return [
    ...rule.hideSelectors.map((selector) => `${selector} { display: none !important; }`),
    rule.css
  ]
    .filter((part) => part.trim())
    .join("\n");
}
