// CRM C4.4-fix2 ▸ read-only check: does core sanitizeHtml double-escape `&amp;` inside href? (pure) ◂
const { sanitizeHtml } = (await import("@/lib/core/sanitize" as string)) as { sanitizeHtml: (h: string, o?: unknown) => string };
const once = sanitizeHtml('<p><a href="https://shop.test/p?a=1&amp;b=2">x</a></p>', { allowLinkSchemes: ["http", "https"] });
const twice = sanitizeHtml(once, { allowLinkSchemes: ["http", "https"] });
console.log(JSON.stringify({ once, twice }));
