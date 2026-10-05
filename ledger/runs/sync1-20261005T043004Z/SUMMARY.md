# suites run sync1 — 20261005T043004Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-sync-client` · head `d854fbad`
| 1 | install | 0 | 8 |  |
| 2 | fitness-pos | 0 | 7 |  |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 3.67s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 7.7s using pnpm v10.33.0
```

### 02-fitness-pos.log (last 15 lines)
```

── F15: POS (แคตตาล็อก/ราคาผู้เขียนเดียว · สัญญา createSale · ทะเบียนปุ่ม POS · ข้อความ pos.* สองภาษา) ──
  ✅ [F15.1] แคตตาล็อก/ราคามีผู้เขียนที่เดียว (catalog.ts ∪ baseline ต่อจุดเขียน · หนี้เดิม 1 ไฟล์ 2 จุด) — ตรง (3 ไฟล์ 45 จุด)
  ✅ [F15.2] สัญญา createSale/voidSale/refundSale ใน src/lib/modules/pos/service.ts เข้ากันได้ย้อนหลังกับ scripts/pos-sale-contract.json (ขาเข้า/ขาออก · ทุก overload) — ตรง (createSale/voidSale · 42 ฟิลด์ · ผู้เรียก createSale 15 ไฟล์) · ของใหม่ที่เข้ากันได้ 5: CreateSaleInput.lines[].options?, CreateSaleInput.lines[].components?, CreateSaleInput.lines[].weightGrams?, CreateSaleInput.shiftId?, CreateSaleInput.soldByUserId? → รัน --update-pos-contract
  ✅ [F15.3a] ปุ่ม POS ที่มี data-testid มีแถวใน scripts/pos-ui-inventory.json ครบ + ไม่มีปุ่มใหม่ที่ไร้ testid (สแกน 62 ไฟล์ · หนี้ไร้ testid 47) — ครบ (testid กดได้ 113 · แถว 112 · ของทะเบียนอื่น 2)
  ✅ [F15.3b] ทุกแถวใน scripts/pos-ui-inventory.json ชี้ testid ที่มีจริง · ไม่ซ้ำ · ฟิลด์ถูกต้อง · baselineDebt ไม่เหลือหนี้ที่ปิดแล้ว (112 แถว) — ตรง
  ✅ [F15.4] ข้อความ pos.* มีครบทั้ง th/en · ไม่ว่าง · ค่าภาษาไทยมีอักษรไทย (ยกเว้นคำสากลใน UNIVERSAL_TOKENS) — ครบ 301 คีย์ (th/pos.json, en/pos.json)
  ✅ [F15.5] ตัวบ่งชี้ผู้เรียกระดับระบบของแคตตาล็อก + backfill ไม่หลุดถึงโค้ดที่รับคำขอ (catalog.ts · สคริปต์ backfill · qc-* · allowlist เท่านั้น) · R4: ห้าม ?? / || / ?: / alias ของตัวบ่งชี้ — สะอาด
  ✅ [F15.7] ประตูเดิมของคลัง/บัญชีแตะ POS ได้เฉพาะ pos/catalog-legacy · pos (CatalogError) · pos/catalog (F2.1 เปิดเส้น inventory→pos / account→pos ให้แค่นี้) — สะอาด
  ✅ [F15.6] src/** ห้าม import จาก scripts/** (static · import() · require · import = require · typeof import()) · baseline 0 จุด — สะอาด (0 จุดตาม baseline)

JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}
```
