// qr-i18n.ts — message lookup for the public QR pages (/q/**) · POS P2.7 S
// Server-only helper (no "use client"): locale = ?lang=th|en, else cookie "lang", else th. Texts come from src/messages/{th,en}/pos.json block "qr".
// No Thai literals in this folder (ST7) — every string shown to the guest is a message key.
import { cookies } from "next/headers";
import thPos from "@/messages/th/pos.json";
import enPos from "@/messages/en/pos.json";

export type QrLocale = "th" | "en";
type Tree = { [k: string]: string | Tree };

export async function qrLocale(lang: string | undefined): Promise<QrLocale> {
  if (lang === "th" || lang === "en") return lang;
  return (await cookies()).get("lang")?.value === "en" ? "en" : "th";
}

/** t("table.title", { table: "A1" }) — key under pos.qr (or a full "qr.errors.x" / "orders.x" key under pos) */
export function qrT(locale: QrLocale): (key: string, vars?: Record<string, string | number>) => string {
  const root = (locale === "en" ? enPos : thPos) as unknown as Tree;
  return (key, vars) => {
    const path = key.startsWith("qr.") ? key.split(".") : ["qr", ...key.split(".")];
    let cur: string | Tree | undefined = root;
    for (const p of path) cur = cur && typeof cur === "object" ? cur[p] : undefined;
    let s = typeof cur === "string" ? cur : key;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

/** money without locale-dependent formatting in SSR (two decimals only when satang) */
export function qrMoney(satang: number): string {
  const whole = Math.trunc(satang / 100);
  const frac = Math.abs(satang % 100);
  const grouped = String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${satang < 0 ? "-" : ""}${grouped}${frac ? `.${String(frac).padStart(2, "0")}` : ""}`;
}
