// HR VIS-5d ▸ settings page sub-tabs (?tab=) — pure: which panel a URL opens (mockup 08 left menu) ◂
//   explicit known ?tab= wins · result params of the pay cards (run2 · pacct · fmsg · fflds · fdoc) → pay · ?life= → life · else shifts
//   unknown / empty / array ?tab= = ignored (controller ruling Q2 · falls to the param rules)

export const SETTINGS_TABS = ["shifts", "leave", "holidays", "rules", "pay", "connect", "life"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** params written by the pay-tab cards' actions/redirects (engine · accounting · filing profile) */
const PAY_KEYS = ["run2", "pacct", "fmsg", "fflds", "fdoc"] as const;

type Sp = Record<string, unknown>;

export function settingsTabOf(sp: Sp): SettingsTab {
  const t = sp.tab;
  if (typeof t === "string" && (SETTINGS_TABS as readonly string[]).includes(t)) return t as SettingsTab;
  if (PAY_KEYS.some((k) => typeof sp[k] === "string")) return "pay";
  if (typeof sp.life === "string") return "life";
  return "shifts";
}

/** link of a settings tab (the menu · the connections mini card) */
export const settingsTabHref = (systemId: string, tab: SettingsTab) => `/app/sys/${systemId}/hr/settings?tab=${tab}`;
