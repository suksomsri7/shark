// Custom Domain — ร้านต่อโดเมนตัวเองเข้าหน้าร้าน (WO-0025)
//
// สถาปัตยกรรม: บันทึกโดเมน + สถานะไว้บน Tenant (global model → ใช้ prisma ตรง, ดู scope.ts)
// เชื่อม Vercel Domains API ผ่าน VercelDomainClient (ฉีดได้ตอนทดสอบ / ของจริงจาก env)
// - addDomain        : POST v10/projects/<proj>/domains       (เพิ่มโดเมนเข้า project)
// - getDomainStatus  : GET  v9/projects/<proj>/domains/<domain> (verified? → active/pending/error)
// - removeDomain     : DELETE v9/projects/<proj>/domains/<domain>
// สถานะภายในเราแมปเป็น DomainStatus enum: NONE / PENDING_DNS / VERIFYING / ACTIVE / FAILED
// proxy จะเรียก resolveTenantByHost() เพื่อ map host → ร้าน (เฉพาะ ACTIVE เท่านั้น)

import { prisma } from "@/lib/core/db";

export type VercelDomainClient = {
  addDomain(domain: string): Promise<void>;
  getDomainStatus(domain: string): Promise<"pending" | "active" | "error">;
  removeDomain(domain: string): Promise<void>;
};

type DomainCtx = { tenantId: string };
type Deps = { client?: VercelDomainClient };

// เปิดใช้ต่อเมื่อ env ครบ (token + project) — ไม่ครบ = ปิดฟีเจอร์อย่างสุภาพ
export function domainEnabled(): boolean {
  return Boolean(process.env.SHARK_VERCEL_TOKEN && process.env.SHARK_VERCEL_PROJECT);
}

// ── DNS ที่ให้ร้านตั้ง: CNAME → cname.vercel-dns.com ──
const DNS_TARGET = "cname.vercel-dns.com";

// normalize host: ตัดช่องว่าง, ทำตัวเล็ก, ตัดจุดท้าย (FQDN trailing dot) ออก
function normalizeHost(host: string): string {
  return (host ?? "").trim().toLowerCase().replace(/\.+$/, "");
}

// hostname ถูกต้องไหม: a-z0-9.- เท่านั้น, มีจุด, ทุก label ถูกต้อง, ไม่ใช่ *.shark.in.th
function isValidHostname(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  if (!host.includes(".")) return false;
  if (host.includes("..")) return false;
  if (host === "shark.in.th" || host.endsWith(".shark.in.th")) return false;
  return host.split(".").every(
    (label) => label.length >= 1 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"),
  );
}

// เลือก client: ฉีดมาก่อน → ไม่งั้นถ้า env ครบใช้ของจริง → ไม่งั้น null (ปิด)
function resolveClient(deps?: Deps): VercelDomainClient | null {
  if (deps?.client) return deps.client;
  if (domainEnabled()) return realVercelClient();
  return null;
}

// แมปสถานะจาก Vercel → DomainStatus ภายในเรา (ไม่ใช้ ternary+as const ตามกติกา)
function mapStatus(s: "pending" | "active" | "error"): "ACTIVE" | "VERIFYING" | "FAILED" {
  if (s === "active") return "ACTIVE";
  if (s === "pending") return "VERIFYING";
  return "FAILED";
}

// ── ขอเชื่อมโดเมน: validate → กันซ้ำ → addDomain → บันทึก PENDING_DNS ──
export async function requestDomain(
  ctx: DomainCtx,
  domain: string,
  deps?: Deps,
): Promise<{ ok: true; dns: { type: "CNAME"; value: string } } | { ok: false; error: string }> {
  const host = normalizeHost(domain);
  if (!isValidHostname(host)) {
    return { ok: false, error: "ชื่อโดเมนไม่ถูกต้อง — กรอกเป็นโดเมนของคุณ เช่น shop.example.com (ไม่ใช่โดเมนย่อยของ shark.in.th)" };
  }

  const client = resolveClient(deps);
  if (!client) {
    return { ok: false, error: "ระบบโดเมนยังไม่เปิดใช้งานในเซิร์ฟเวอร์นี้ — โปรดติดต่อผู้ดูแลระบบ" };
  }

  // โดเมนซ้ำกับร้านอื่น (customDomain @unique) → ปฏิเสธ
  const taken = await prisma.tenant.findFirst({ where: { customDomain: host, NOT: { id: ctx.tenantId } } });
  if (taken) {
    return { ok: false, error: "โดเมนนี้ถูกใช้กับร้านอื่นแล้ว" };
  }

  try {
    await client.addDomain(host);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เพิ่มโดเมนไม่สำเร็จ" };
  }

  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { customDomain: host, domainStatus: "PENDING_DNS" },
  });
  return { ok: true, dns: { type: "CNAME", value: DNS_TARGET } };
}

// ── ตรวจสถานะโดเมนกับ Vercel แล้วอัปเดต Tenant ──
export async function checkDomain(ctx: DomainCtx, deps?: Deps): Promise<{ status: string }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const host = tenant?.customDomain;
  if (!host) return { status: "NONE" };

  const client = resolveClient(deps);
  if (!client) return { status: tenant.domainStatus }; // ไม่มี client → คืนสถานะเดิม

  const raw = await client.getDomainStatus(host);
  const status = mapStatus(raw);
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { domainStatus: status } });
  return { status };
}

// ── ยกเลิกโดเมน: ถอดจาก Vercel + เคลียร์ field → NONE ──
export async function removeDomain(ctx: DomainCtx, deps?: Deps): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const client = resolveClient(deps);
  if (client && tenant?.customDomain) {
    try {
      await client.removeDomain(tenant.customDomain);
    } catch {
      // ถอดฝั่ง Vercel ไม่สำเร็จ ก็ยังเคลียร์ฝั่งเราเพื่อให้ร้านลองใหม่ได้
    }
  }
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { customDomain: null, domainStatus: "NONE" },
  });
  return true;
}

// ── proxy/app ใช้: host → ร้าน (เสิร์ฟเฉพาะโดเมนที่ ACTIVE แล้วเท่านั้น) ──
export async function resolveTenantByHost(host: string): Promise<{ slug: string } | null> {
  const h = normalizeHost(host);
  if (!h) return null;
  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: h, domainStatus: "ACTIVE" },
    select: { slug: true },
  });
  return tenant ? { slug: tenant.slug } : null;
}

// ── host → path หน้าร้านเข้าใช้ทันที (WO-0065 · ADR A6 ทาง ก: resolve ที่ชั้น app) ──
// custom domain ที่ ACTIVE → หน้าร้าน BusinessUnit ตัวแรก (ACTIVE, เรียง createdAt เก่าสุดก่อน)
// คืน "/s/<tenantSlug>/<unitSlug>" · ไม่เจอ tenant / ยังไม่ ACTIVE / ไม่มี unit ACTIVE → null (ยังไม่มีอะไรให้โชว์)
export async function hostEntryPath(host: string): Promise<string | null> {
  const tenant = await resolveTenantByHost(host);
  if (!tenant) return null;
  const unit = await prisma.businessUnit.findFirst({
    where: { tenant: { slug: tenant.slug }, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { slug: true },
  });
  if (!unit) return null;
  return `/s/${tenant.slug}/${unit.slug}`;
}

// ── Vercel Domains API client จริง (จาก env) ──
// SHARK_VERCEL_TOKEN + SHARK_VERCEL_PROJECT (+ SHARK_VERCEL_TEAM optional)
export function realVercelClient(): VercelDomainClient {
  const token = process.env.SHARK_VERCEL_TOKEN ?? "";
  const project = process.env.SHARK_VERCEL_PROJECT ?? "";
  const team = process.env.SHARK_VERCEL_TEAM;
  const teamQuery = team ? `?teamId=${encodeURIComponent(team)}` : "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  return {
    async addDomain(domain: string): Promise<void> {
      const res = await fetch(`https://api.vercel.com/v10/projects/${project}/domains${teamQuery}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: domain }),
      });
      // 409 = โดเมนอยู่ใน project นี้แล้ว → ถือว่าสำเร็จ (idempotent)
      if (!res.ok && res.status !== 409) {
        throw new Error(`Vercel addDomain ล้มเหลว (${res.status})`);
      }
    },
    async getDomainStatus(domain: string): Promise<"pending" | "active" | "error"> {
      const res = await fetch(`https://api.vercel.com/v9/projects/${project}/domains/${domain}${teamQuery}`, {
        headers,
      });
      if (res.status === 404) return "pending"; // ยังไม่ผูก DNS
      if (!res.ok) return "error";
      const data = (await res.json().catch(() => null)) as { verified?: boolean } | null;
      if (data?.verified === true) return "active";
      return "pending"; // misconfigured / ยังไม่ verify → รอต่อ
    },
    async removeDomain(domain: string): Promise<void> {
      const res = await fetch(`https://api.vercel.com/v9/projects/${project}/domains/${domain}${teamQuery}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Vercel removeDomain ล้มเหลว (${res.status})`);
      }
    },
  };
}
