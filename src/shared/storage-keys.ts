/** Stable logical keys. Legacy names are retained for upgrade compatibility. */
export const STORAGE_KEYS = {
  tabGroupBindings: "hourleaf.tab-group-bindings.v1",
  tabGroupBindingRecords: "hourleaf.tab-group-bindings.v2",
  tabGroupBindingSession: "hourleaf.tab-group-binding-session.v1",
  settings: "bilifocus.settings.v1",
  usage: "bilifocus.usage.v1",
  temporaryAccess: "bilifocus.temporary-access.v1",
  periodRuntime: "hourleaf.period-runtime.v1",
  visitConfirmation: "hourleaf.visit-confirmation.v1",
  planQueue: "bilifocus.plan-queue.v1",
  planAccess: "bilifocus.plan-access.v1",
  modules: "hourleaf.modules.v1",
  localModules: "hourleaf.local-modules.v1"
} as const;
