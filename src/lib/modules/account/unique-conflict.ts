// unique-conflict.ts — อ่านว่า "P2002 ชนที่ index ไหน" อย่างแม่นยำ (WO 9.2 ข้อ 13)
//
// 🔴 บั๊กจริงที่ทำให้ต้องมีไฟล์นี้ (เจอด้วย qc-acc-v2-security S13):
//    ตัวตรวจเดิมของ product.ts/service.ts เอา `err.message` ทั้งก้อนมา `.test(/code/)`
//    แต่ **Prisma 7 แนบ "ซอร์สโค้ดรอบบรรทัดที่ล้ม" มาในข้อความ error ด้วย** เช่น
//        → 524 const p = await prisma.accountProduct.create({ data: { ...base, code } });
//    บรรทัดนั้นมีคำว่า `code` อยู่ในตัวโค้ดเอง ⇒ การชน **SKU ซ้ำ** ถูกอ่านว่า "เลขที่ซ้ำ" ทุกครั้ง
//    ⇒ วนขอเลขใหม่ 6 รอบ (ชน SKU เดิมทุกรอบ) → ตกมาที่ create ก้อนสุดท้ายซึ่งก็ชน SKU อีก
//    → โยน PrismaClientKnownRequestError ดิบออกจากฟังก์ชันที่ประกาศว่าคืน `{ok:false,reason}`
//    ผลกับผู้ใช้: พิมพ์ SKU ซ้ำ → เจอ 500 พร้อมข้อความอังกฤษ แทน "รหัสสินค้า (SKU) ซ้ำกับที่มีอยู่"
//
// กติกา: ตัดสินจาก **ชื่อฟิลด์/ชื่อ index ที่ดึงออกมาเป็นชิ้น ๆ** เท่านั้น — ห้ามค้น substring ในข้อความรวม

/**
 * รายชื่อฟิลด์ + ชื่อ constraint ที่ทำให้เกิด P2002 (ไม่ใช่ P2002 = คืน [])
 *
 * ดึงจาก 4 ทาง เพราะแต่ละคู่ Prisma/driver ให้มาไม่เหมือนกัน:
 *   (ก) `meta.driverAdapterError.cause.constraint.fields` / `.name` — @prisma/adapter-pg
 *   (ข) `meta.target` — Prisma รุ่นที่ยังส่งมาให้ (Prisma 7 + adapter-pg **ไม่ส่ง**)
 *   (ค) วงเล็บหลัง "failed on the fields: (...)" ในข้อความของ Prisma
 *   (ง) ชื่อ constraint ในข้อความดิบของ Postgres: violates unique constraint "…"
 */
export function uniqueConflictTargets(e: unknown): string[] {
  const err = e as {
    code?: string;
    message?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { originalMessage?: string; constraint?: { fields?: unknown; name?: unknown } } };
    };
  };
  if (err?.code !== "P2002") return [];
  const out: string[] = [];
  const clean = (s: string) => s.replace(/[`"'\s]/g, "");

  const cause = err.meta?.driverAdapterError?.cause;
  const fields = cause?.constraint?.fields;
  if (Array.isArray(fields)) out.push(...fields.map((f) => clean(String(f))));
  const cname = cause?.constraint?.name;
  if (typeof cname === "string") out.push(clean(cname));

  const target = err.meta?.target;
  if (Array.isArray(target)) out.push(...target.map((t) => clean(String(t))));
  else if (typeof target === "string") out.push(clean(target));

  for (const text of [cause?.originalMessage, err.message]) {
    const s = String(text ?? "");
    const m = s.match(/failed on the fields:\s*\(([^)]*)\)/);
    if (m) out.push(...m[1]!.split(",").map(clean));
    const idx = s.match(/violates unique constraint\s+"([^"]+)"/);
    if (idx) out.push(clean(idx[1]!));
  }
  return out.filter(Boolean);
}

/**
 * P2002 นี้เกิดจาก index ของคอลัมน์ `code` ใช่ไหม (ไม่ใช่ sku/barcode/เลขภาษี/อื่น ๆ)
 * @param indexName ชื่อ partial unique index ของตารางนั้น (ตรวจก่อนเป็นอันดับแรก)
 */
export function isCodeUniqueConflict(e: unknown, indexName: string): boolean {
  const targets = uniqueConflictTargets(e);
  if (targets.length === 0) return false;
  if (targets.includes(indexName)) return true;
  // เทียบแบบ "ชื่อฟิลด์เป๊ะ" — `sku` / `barcode` / `branchCode` จึงไม่มีทางเข้าใจผิดเป็น `code`
  return targets.some((t) => t === "code");
}
