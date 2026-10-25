/** Active release targets shared by the build and packaging entry points. */
export const browserTargets = Object.freeze({
  chromium: "chrome121",
  safari: "safari17"
});

/** @typedef {keyof typeof browserTargets} BrowserTarget */
export const supportedTargets = /** @type {BrowserTarget[]} */ (Object.keys(browserTargets));
