// ==UserScript==
// @format       hourleaf.local-module
// @id           hourleaf.local.bilibili-focus
// @name         Bilibili
// @author       Hourleaf contributors
// @version      1.2.5
// @description  按 / 聚焦站内搜索；相关视频屏蔽生效时关闭片尾自动连播。
// @match        https://www.bilibili.com/*
// @match        https://search.bilibili.com/*
// ==/UserScript==

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      active?.getAttribute("contenteditable") === "true"
    ) {
      return;
    }
    const selectors = ".nav-search-input, #nav-searchform input, input[type='search']";
    const nativeSearch = document.querySelector(selectors);
    const bewlyHost = document.querySelector("#bewly");
    const bewlySearch = bewlyHost?.shadowRoot?.querySelector("#search-wrap input");
    const search = nativeSearch ?? bewlySearch;
    if (!(search instanceof HTMLInputElement)) return;
    event.preventDefault();
    search.focus();
  },
  true
);

/** The group's hide rule is the sole source of truth, including timed/plan preferences. */
function installRelatedPlaybackGuard() {
  const markerId = "hourleaf-bilibili-related-playback-guard";
  if (location.origin !== "https://www.bilibili.com" || document.getElementById(markerId)) return;

  const marker = document.createElement("span");
  marker.id = markerId;
  marker.setAttribute("aria-hidden", "true");
  // An empty, zero-size marker is visible to CSS without rendering page content.
  marker.style.cssText =
    "display:block;position:fixed;width:0;height:0;overflow:hidden;pointer-events:none";
  document.documentElement.append(marker);

  const selector =
    ".next-play:has(.video-page-card-small a[href*='/video/']):not(:has(.ad-report, [class*='commercial'], [data-target-url*='cm.bilibili.com'], a[href*='cm.bilibili.com'], a[href*='/cheese/'])) .continuous-btn";
  const controls = new Map();
  let queued = false;
  let stopped = false;

  function isOn(control) {
    return Boolean(control.querySelector(".switch-btn.on"));
  }

  function discover(scope) {
    if (scope instanceof Element && scope.matches(selector) && !controls.has(scope)) {
      controls.set(scope, { restore: false });
    }
    for (const control of scope.querySelectorAll(selector)) {
      if (!controls.has(control)) controls.set(control, { restore: false });
    }
  }

  function restoreControl(control, state) {
    if (!state.restore) return;
    state.restore = false;
    if (control.isConnected && !isOn(control)) control.click();
  }

  function sync() {
    if (stopped) return;
    const active =
      location.pathname.startsWith("/video/") &&
      marker.isConnected &&
      getComputedStyle(marker).display === "none";
    for (const [control, state] of controls) {
      if (!control.isConnected) {
        controls.delete(control);
        continue;
      }
      if (active && control.matches(selector)) {
        if (isOn(control)) {
          state.restore = true;
          // Use the site's UI handler: it updates relatedAutoplay and aborts handoff.
          control.click();
        }
      } else {
        restoreControl(control, state);
      }
    }
  }

  function scheduleSync() {
    if (queued || stopped) return;
    queued = true;
    // Let the site's click handlers and Vue updates settle before reading state.
    queueMicrotask(() => {
      queued = false;
      sync();
    });
  }

  const observer = new MutationObserver((mutations) => {
    let changed = false;
    const nextPlayRoots = new Set();
    for (const mutation of mutations) {
      const target =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target?.closest("style, .next-play")) changed = true;
      const nextPlay = target?.closest(".next-play");
      if (nextPlay) nextPlayRoots.add(nextPlay);
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches("style") || node.querySelector("style")) changed = true;
        const count = controls.size;
        discover(node);
        if (controls.size !== count) changed = true;
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.id === markerId || node.contains(marker)) changed = true;
        if (node.matches("style") || node.querySelector("style")) changed = true;
        if ([...controls.keys()].some((control) => node === control || node.contains(control)))
          changed = true;
      }
    }
    // The toggle can arrive before its card; discover again only within affected containers.
    for (const root of nextPlayRoots) discover(root);
    if (changed) scheduleSync();
  });

  function start() {
    stopped = false;
    discover(document);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    sync();
  }

  document.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Element && event.target.closest(".continuous-btn"))
        scheduleSync();
    },
    true
  );
  document.addEventListener("ended", scheduleSync, true);
  window.addEventListener("popstate", scheduleSync);
  window.addEventListener("pagehide", () => {
    stopped = true;
    observer.disconnect();
    for (const [control, state] of controls) restoreControl(control, state);
    controls.clear();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) start();
  });
  start();
}

installRelatedPlaybackGuard();
