# Runbook — Module ordering and the 36px hero shift

## Module ordering

Sections in Operations and Marketing sort by `foodos_module_settings.display_order` and open by `default_expanded` (`src/hooks/useModuleLayout.ts`, pure rules in `src/lib/moduleLayout.ts`). A manual expand/collapse persists in `sessionStorage` under `foodos-module-expanded` and never writes to the table.

To change the default order or state: update the row. To reset a user's session overrides: clear that sessionStorage key.

## Hero shift

`MarketingBanner` is 36px (py-2 + text-sm) and renders after `app_settings` loads. It now holds a 36px slot while loading; whether to hold it on a cold visit is remembered in `localStorage` (`marketing-banner-last-shown`), defaulting to reserve.

**Check on a phone.** If the hero still moves, the cause is elsewhere — most likely a web-font swap — and this fix has removed only the banner's contribution.
