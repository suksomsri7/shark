"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Topbar } from "./Topbar";
import { NavDrawer, type NavItem, type SoonItem, type TenantOption } from "./NavDrawer";
import { AiDock } from "./AiDock";
import { AddSystemModal } from "./AddSystemModal";
import { loadNavBadgesAction } from "@/lib/support/actions";

// โครงแอปฝั่ง client: จัดการสถานะเปิด/ปิด drawer
// help-v2: เอาศูนย์ช่วยเหลือออก — แจ้งปัญหาผ่านแชท AI แทน (ทีมงานตอบกลับในห้องเดิม)
// รับข้อมูลที่ดึงจาก DB มาจาก layout (server) เป็น props — ตัว shell ไม่แตะ DB เอง
export function AppShell({
  tenantName,
  userEmail,
  items,
  soon,
  openedCodes,
  memberships,
  activeTenantId,
}: {
  tenantName: string;
  userEmail: string;
  items: NavItem[];
  soon: SoonItem[];
  openedCodes: string[];
  memberships: TenantOption[];
  activeTenantId: string;
}) {
  const [drawer, setDrawer] = useState(false);
  // Modal เพิ่มระบบ (กลางจอ) — เปิดจากปุ่มใน drawer หรือ deep-link ?add-system=1 (จากเช็กลิสต์ "ทำต่อ")
  const [addSystemOpen, setAddSystemOpen] = useState(false);
  // ?add-system=<CODE> จาก checklist → เปิด modal พร้อมเลือกระบบนั้นให้เลย (เข้าจังหวะตั้งชื่อทันที)
  const [addSystemPreselect, setAddSystemPreselect] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // เปิด modal เมื่อมี query ?add-system=1 แล้วลบ query ทิ้ง (กันเปิดซ้ำตอน refresh/back)
  useEffect(() => {
    const want = searchParams.get("add-system");
    if (want) {
      if (want !== "1") setAddSystemPreselect(want); // ?add-system=<CODE> → เลือกระบบนั้นให้เลย (จาก checklist)
      setAddSystemOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);
  // perf A: โหลด badge แชท AI หลังหน้าโผล่ (ไม่บล็อกการเปลี่ยนหน้า)
  const [aiUnread, setAiUnread] = useState(0);
  // เปิดจากแอปมือถือ (WebView ส่ง UA "SharkApp") → ซ่อน orb เว็บ (แอปมีปุ่ม AI native ของตัวเอง — กัน orb ซ้อน)
  // เช็คใน effect กัน hydration mismatch (SSR ไม่รู้ UA client)
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    if (navigator.userAgent.includes("SharkApp")) setInApp(true);
  }, []);
  useEffect(() => {
    let alive = true;
    loadNavBadgesAction()
      .then((b) => { if (alive) setAiUnread(b.aiUnread); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <>
      <Topbar tenantName={tenantName} onMenu={() => setDrawer(true)} />
      <NavDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        tenantName={tenantName}
        userEmail={userEmail}
        items={items}
        soon={soon}
        onAddSystem={() => {
          setDrawer(false);
          setAddSystemOpen(true);
        }}
        memberships={memberships}
        activeTenantId={activeTenantId}
      />
      <AddSystemModal
        preselect={addSystemPreselect}
        open={addSystemOpen}
        onClose={() => {
          setAddSystemOpen(false);
          setAddSystemPreselect(null); // เปิดครั้งหน้าจากปุ่มปกติ = เริ่มที่จังหวะเลือกระบบ
        }}
        openedCodes={openedCodes}
      />
      {!inApp && <AiDock aiUnread={aiUnread} />}
    </>
  );
}
