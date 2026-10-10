// C5.5-fix5 — reference copies of the pre-fix expressions, VERBATIM from b8e8ad52 (the oracle the linear rewrites must equal
// byte-for-byte). Reference fixture only — never imported by src/.
/* eslint-disable */

// src/lib/modules/kanban/cards.ts descriptionToText (b8e8ad52 :325)
export function descriptionToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// src/lib/core/inbound-address.ts bareEmail (b8e8ad52 :39)
export function bareEmail(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = s.match(/<([^>]*)>\s*$/);
  return (m ? (m[1] ?? "") : s).trim().toLowerCase();
}

// src/lib/modules/crm/emails-shared.ts displayNameOf (b8e8ad52 :146)
export function displayNameOf(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = s.match(/^\s*(.*?)\s*<[^>]*>\s*$/);
  const name = m ? (m[1] ?? "") : "";
  return name.replace(/^["']|["']$/g, "").trim();
}

// src/lib/platform/kanban-email-in.ts bareEmail (b8e8ad52 :82, private)
export function kanbanBareEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim().toLowerCase();
}

// src/lib/core/email.ts bareAddr (b8e8ad52 :89, private)
export function coreBareAddr(v: string): string {
  const m = v.match(/<([^>]*)>\s*$/);
  return (m ? (m[1] ?? "") : v).trim();
}

// src/lib/modules/crm/emails.ts refIdsOf body (b8e8ad52 :2334, private) — without the uniq()
export function refIds(raw: string): string[] {
  return [...raw.matchAll(/<([^>]+)>/g)].map((m) => (m[1] ?? "").trim());
}

// src/lib/modules/crm/emails.ts authResultPass pair regex (b8e8ad52 :2173)
export const AUTH_PAIR_RE = /([a-z0-9._-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s";]+)/g;

// src/lib/modules/crm/emails-shared.ts emailSnippet tag strip (b8e8ad52 :232) — applied to sanitizeHtml(html)
export const snippetStrip = (sanitized: string) => sanitized.replace(/<[^>]*>/g, " ");

// src/app/app/sys/[id]/crm/emails/[threadKey]/page.tsx (b8e8ad52 :25)
export const REMOTE_IMG_RE = /<img[^>]+src="https?:/i;

// src/lib/modules/crm/emails-actions.ts:106 catch-path expression (RV-1)
export const actionCatchStrip = (bodyHtml: unknown) => String(bodyHtml ?? "").replace(/<[^>]*>/g, "").trim();

// src/lib/modules/crm/emails-shared.ts crmEmailHtmlToComposerText per-line trim (b8e8ad52 :463)
export const composerLineTrim = (l: string) => l.replace(/[ \t]+$/g, "");

// src/lib/modules/crm/contacts-shared.ts maskPii (b8e8ad52 :385)
export function maskPii(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/[^\s@"'<>]+@([^\s@"'<>]+)/g, (_m, d: string) => `x…@${d}`)
    .replace(/\+?\d[\d\s-]{3,}\d/g, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 5 ? `${"x".repeat(Math.max(0, digits.length - 2))}${digits.slice(-2)}` : m;
    });
}

// src/lib/branding/logo.ts SVG_UNSAFE_PATTERNS (b8e8ad52 :43)
export const SVG_UNSAFE_PATTERNS = [/<script/i, /on[a-z]+\s*=/i, /javascript:/i];
export const svgUnsafe = (t: string) => SVG_UNSAFE_PATTERNS.some((re) => re.test(t));

// src/lib/modules/crm/emails.ts setUserSetting signature (b8e8ad52 :642) — needs the core sanitizer
export const signatureOld = (sanitizeHtml: (s: string) => string, raw: string) => sanitizeHtml(raw.trim()).slice(0, 4000) || null;

// e-mail-in-free-text redaction — crm/api/serialize.ts EMAIL_IN_TEXT · outbox-consumers.ts redactPii · ai/dataset.ts anonymize (b8e8ad52)
export const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// crm/calls-shared.ts redactContactInfo (b8e8ad52 :166) — apostrophe in the local part
export function redactContactInfo(text: string): string {
  return String(text ?? "")
    .replace(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "(อีเมลถูกปิดไว้)")
    .replace(/\+?\d[\d\s\-().]{5,}\d/g, "(เบอร์ถูกปิดไว้)");
}
export function anonymize(text: string): string {
  return String(text ?? "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<EMAIL>")
    .replace(/0\d{8,9}/g, "<PHONE>");
}
export const redactPii = (text: string): string =>
  text.replace(/\d{7,}/g, "[ตัวเลขถูกปิดบัง]").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[อีเมลถูกปิดบัง]");
export const TH_PHONE_IN_TEXT = /(?<![\w+])(?:\+66[\s-]?|0)\d(?:[\s.-]?\d){7,8}(?!\w)/g;
export const maskPiiPatternsWith = (maskContactValue: (m: string) => string) => (text: string) =>
  text.replace(EMAIL_IN_TEXT, (m) => maskContactValue(m)).replace(TH_PHONE_IN_TEXT, (m) => maskContactValue(m));
