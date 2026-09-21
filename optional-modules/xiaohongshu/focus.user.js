// ==UserScript==
// @format       hourleaf.local-module
// @id           hourleaf.local.xiaohongshu-focus
// @name         小红书专注模块
// @author       Hourleaf contributors
// @version      1.0.0
// @description  为首页推荐过滤维护不含页面内容的路由标记。
// @match        https://www.xiaohongshu.com/*
// ==/UserScript==

(() => {
  const root = document.documentElement;
  let lastUrl = "";

  const syncPageMarker = () => {
    if (lastUrl === location.href) return;
    lastUrl = location.href;
    const path = location.pathname.replace(/\/+$/u, "") || "/";
    root.dataset.hourleafXhsPage = path === "/" || path === "/explore" ? "home" : "other";
  };

  syncPageMarker();
  window.addEventListener("pageshow", syncPageMarker, { passive: true });
  window.addEventListener("popstate", syncPageMarker, { passive: true });
  window.addEventListener("hashchange", syncPageMarker, { passive: true });

  const observer = new MutationObserver(syncPageMarker);
  observer.observe(root, { childList: true, subtree: true });
})();
