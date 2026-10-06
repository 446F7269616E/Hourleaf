declare const __HOURLEAF_BUILD_FLAVOR__: "release" | "debug";
export const DEBUG_BUILD =
  typeof __HOURLEAF_BUILD_FLAVOR__ !== "undefined" && __HOURLEAF_BUILD_FLAVOR__ === "debug";
