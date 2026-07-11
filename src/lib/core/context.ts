import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import type { BusinessUnit, Membership, Tenant, User } from "@prisma/client";
import { prisma } from "./db";
import { getSessionUser } from "./session";
import { canAccessUnit } from "./rbac";

const ACTIVE_TENANT_COOKIE = "shark_tenant";

export type Auth = {
  user: User;
  memberships: (Membership & { tenant: Tenant })[];
  active: (Membership & { tenant: Tenant }) | null;
};

// อ่านบริบทผู้ใช้ปัจจุบัน (null ถ้าไม่ได้ล็อกอิน)
export async function getAuth(): Promise<Auth | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, acceptedAt: { not: null } },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
  const activeId = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
  const active =
    memberships.find((m) => m.tenantId === activeId) ?? memberships[0] ?? null;
  return { user, memberships, active };
}

// บังคับล็อกอิน — ไม่งั้น redirect /login
export async function requireAuth(): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return auth;
}

// บังคับมีร้าน — ไม่งั้น redirect /onboarding
export async function requireTenant(): Promise<Auth & { active: Membership & { tenant: Tenant } }> {
  const auth = await requireAuth();
  if (!auth.active) redirect("/onboarding");
  return auth as Auth & { active: Membership & { tenant: Tenant } };
}

export async function setActiveTenant(tenantId: string): Promise<void> {
  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

// resolve unit จาก slug ในบริบทร้าน + ตรวจสิทธิ์เข้าถึง (404 แทน 403 กัน enumeration)
export async function requireUnit(
  unitSlug: string,
): Promise<{ auth: Awaited<ReturnType<typeof requireTenant>>; unit: BusinessUnit }> {
  const auth = await requireTenant();
  const unit = await prisma.businessUnit.findUnique({
    where: { tenantId_slug: { tenantId: auth.active.tenantId, slug: unitSlug } },
  });
  if (!unit) notFound();
  const m = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  if (!canAccessUnit(m, unit.id)) notFound();
  return { auth, unit };
}
