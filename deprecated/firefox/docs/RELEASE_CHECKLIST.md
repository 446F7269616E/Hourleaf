# Archived Firefox release checklist

Retained on 2026-10-25; outside the active release requirements.

### Firefox

- [ ] Manifest retains the stable Gecko ID and accurate `data_collection_permissions`.
- [ ] No `userScripts` permission; only script-free JSON/CSS imports; old scripts are not registered.
- [ ] Verify actual versions with and without group/session APIs; do not infer support from the browser name.
- [ ] `web-ext lint` passes; matching build instructions and review source are submitted to AMO.
- [ ] The final AMO-signed XPI passes installation, upgrade, disable, enable, and uninstall checks.
