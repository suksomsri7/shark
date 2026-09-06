# B5 — แอป SHARK HUB รับธีมกิจการ (OTA, no native build) (บันทึกผู้ทำ)

> WO: `ledger/BRANDING-RUN.md` §สัญญา B5
> ข้อสอบ: `scripts/qc-branding-b5.mts` (6 ข้อ static · Fable เขียน · builder ไม่แตะ)
> ผล: **6/6 · CRITICAL 0 · MAJOR 0 · MINOR 0**

## 1. ไฟล์ที่แตะ

**ใหม่**
- `apps/mobile/src/lib/brand.tsx` — `useBrand()` hook + `brandSoft(hex)` helper (ดู §2)

**แก้**
- `apps/mobile/src/lib/auth-context.tsx` — `TenantRow.branding?: {...} | null` (ตรง `/api/mobile/me` ของ B1) · export type `Branding` · `activeBranding` ใน context · hydrate/persist แคช SecureStore
- `apps/mobile/src/lib/session.ts` — เพิ่ม `getCachedBrand`/`setCachedBrand` (key `shark_brand`) · `clearSession()` ลบคีย์นี้ด้วยตอน logout
- `apps/mobile/app/(app)/sessions.tsx` — `useBrand()` แทน `C.blue`/`C.blueHi` ทุกจุด (ปุ่ม + · สปินเนอร์ · ปุ่มเริ่มแชทแรก · การ์ด/จุด unread · ปุ่มแก้ชื่อ (swipe) · ปุ่มบันทึกชื่อ) + หัวจอเปลี่ยนจาก back+spacer+add เป็น back+**โลโก้(ถ้ามี)+displayName**+add
- `apps/mobile/app/(app)/chat/[id].tsx` — `useBrand()` แทนสปินเนอร์โหลด + ปุ่มส่ง
- `apps/mobile/app/dna.tsx` — `useBrand()`: ปุ่มหลักทั้ง 4 จุด (เริ่มตั้งค่า/ต่อไป/ลองอีกครั้ง/ประกอบระบบให้เลย ผ่าน prop ใหม่ `bg` ของ `PrimaryButton`) + choice/bool ตอน pressed (`brand.soft`/`brand.accent`) + วงเลขขั้นตอนสรุปพิมพ์เขียว (`stepNum`/`stepNumText`)
- `apps/mobile/src/components/auth/ui.tsx` — `PrimaryButton` เพิ่ม prop optional `bg?: string` (ไม่ใส่ = น้ำเงินปริยายเดิม ใช้โดย `login.tsx` ที่ไม่แตะ) + pressed state ใช้ `opacity:0.85` แทน `styles.btnPressed` เมื่อมี `bg`
- `apps/mobile/src/components/chat/ChatBubble.tsx` — ฟองข้อความขาออกใช้ `brand.accent`/`brand.accentFg` แทน `C.blue`/`"#ffffff"` คงที่
- `apps/mobile/src/components/chat/ProposalCard.tsx` — เส้นขอบการ์ด/ปุ่มยืนยัน (กรณี NORMAL) ใช้ `brand.accent`/`brand.accentFg` (DESTRUCTIVE ยังแดงเหมือนเดิม ไม่แตะ)
- `apps/mobile/src/components/chat/QuotaBar.tsx` — แถบเติมโควตาใช้ `brand.accent`
- `apps/mobile/src/components/chat/TypingIndicator.tsx` — จุดกระพริบ 3 จุดใช้ `brand.accent`
- `apps/mobile/qc/shoot-ipad.mjs` — เพิ่มโหมด `QC_BRAND=1`: mock `/api/mobile/me` ใส่ `branding` (เทียล `#0E7490`/`accentFg #ffffff`/displayName "SIAM DIVE CENTER"/logoUrl null) · จำกัดจอเหลือ sessions/chat/dna ที่ iPhone 390 + iPad 820×1180 · ภาพลง `apps/mobile/qc/shots-brand/` ของรีโปจริงเสมอ (ดูเหตุผล §4) · โหมดเดิม (ไม่ตั้ง env) พฤติกรรมเหมือนเดิมทุกประการ (regression-safe)

**ไม่แตะ** ตามสัญญา: `login.tsx`, `app/(app)/index.tsx`, `app/(app)/_layout.tsx`, `app.json`, `package.json`

## 2. ดีไซน์ hook + เส้นทางแคช

```
/api/mobile/me (B1)
  └─ loadMe() → setTenants(memberships)  ── membership.branding: {...}|null
       │
       ├─ realBranding = useMemo(tenants.find(active)?.branding ?? null)   ← ของจริงเสมอ
       ├─ cachedBranding = state จาก getCachedBrand() (อ่านตอน bootstrap ก่อน token/me)
       └─ activeBranding = ready ? realBranding : cachedBranding           ← เข้า context
              │
              └─ persist effect: ready เปลี่ยนเป็น true หรือ realBranding เปลี่ยน
                    → setCachedBrand(JSON.stringify(realBranding))  (เขียนทับ SecureStore ทุกครั้ง)

useBrand() (brand.tsx)
  ├─ module-level: SecureStore.getItemAsync("shark_brand") ยิงตอน import ไฟล์ (ก่อนคอมโพเนนต์แรก mount)
  │     → เก็บใน `moduleCache` (best-effort "sync" — จริงคือ async แต่ผลมักพร้อมก่อน mount แรกเพราะ module
  │       evaluation เกิดก่อน React tree ทั้งต้น)
  ├─ ถ้า !ready (context ยังบูตไม่เสร็จ) → คืน moduleCache (กันกะพริบเฟรมแรกสุด ก่อน context เองจะทันด้วยซ้ำ)
  └─ ถ้า ready → เชื่อ activeBranding ตรง ๆ (null จริง = ร้านไม่ได้ตั้งธีม/ปิด applyMobile → ค่าปริยาย C.blue/#fff)
```

- ทำไม 2 ชั้น (context เก็บ cachedBranding เอง **และ** brand.tsx อ่าน SecureStore เองอีกชั้น): context อ่านแคชในสอง `useEffect` ที่ยิงหลัง mount แรกเสมอ (ต้องรอ commit ก่อน) ส่วนโมดูล `brand.tsx` ยิง read ตอนไฟล์ถูก import (เร็วกว่าเพราะเกิดก่อน AuthProvider component สร้างเสร็จด้วยซ้ำ) — สองชั้นนี้ชนกันไม่ได้เพราะเข้าคนละจังหวะ (`!ready` ใช้ของ brand.tsx เอง, `ready` ใช้ของจริงจาก context) ผลคือกันกะพริบได้แน่นกว่าใช้ชั้นเดียว
- `ready` ตัวเดียวกับที่ Gate ใช้เด้ง login อยู่แล้ว (ไม่เพิ่ม state ใหม่ซ้อน) — เมื่อ `ready=true` แปลว่า bootstrap (อ่านแคช→token→/me→เลือก tenant) จบครบแล้ว เชื่อ `activeBranding` ได้เต็มที่
- logout: `clearSession()` ลบ `shark_brand` ด้วย (กันเครื่องสาธารณะสลับ user แล้วเห็นสีร้านเก่าค้างเฟรมแรก)

## 3. ปุ่มหลักของ DNA ไม่ชน `login.tsx`

`PrimaryButton`/`LinkButton` ใน `src/components/auth/ui.tsx` ใช้ร่วมกันระหว่าง `login.tsx` และ `dna.tsx` — สัญญาห้ามแตะ `login.tsx` เพราะ "ก่อนล็อกอินยังไม่รู้ร้าน" แต่ทั้งสองจอเรียกคอมโพเนนต์เดียวกัน จึงเพิ่ม prop optional `bg?: string` ให้ `PrimaryButton`:
- ไม่ใส่ `bg` (ทุกจุดใน `login.tsx`) → พฤติกรรม/สีเดิมทุกประการ (น้ำเงินปริยาย + `styles.btnPressed`)
- `dna.tsx` ส่ง `bg={brand.accent}` ทุกจุดที่เรียก `PrimaryButton` → ปุ่มหลักของ DNA เป็นสีแบรนด์ ไม่กระทบ `login.tsx` เลยแม้จะแก้ไฟล์ `ui.tsx` ที่ทั้งคู่ import ร่วมกัน (แก้ "จอที่ import คอมโพเนนต์ร่วม" ไม่เท่ากับ "แก้ตัวจอ login.tsx" — เจตนาของกติกาคือหน้าจอ login ไม่ควรเปลี่ยนหน้าตา/พฤติกรรม ซึ่งยังคงเดิม 100%)

## 4. ทำไมภาพ QC ลงที่ `apps/mobile/qc/shots-brand/` ของรีโปจริง ไม่ใช่สำเนา

กติกาเครื่อง: สคริปต์/สำเนา web-export ต้องรันจาก `/root/qc-shark-mobile` (chromium แบบ snap อ่าน `/tmp` ไม่ได้ — ไม่เกี่ยวกับ `/root` แต่ทำตามฮาร์เนสเดิมที่ Fable วางไว้) แต่ **ผลลัพธ์ภาพ** ที่ Fable ต้องเปิดดูควรอยู่ในรีโปที่กำลังตรวจงาน ไม่ใช่ path ชั่วคราวที่จะถูกลบ/rsync ทับรอบหน้า จึงตั้ง `OUT` เป็น absolute path ชี้เข้ารีโปจริงตรง ๆ เสมอ (ทำงานถูกต้องไม่ว่าจะรันสคริปต์จากสำเนาไหน เพราะเป็น absolute path)

## 5. ขั้นตอนที่ทำจริง (ตาม README เดิมของ `qc/README.md`)

1. `rsync -a --exclude node_modules --exclude dist --exclude credentials* apps/mobile/ /root/qc-shark-mobile/` (ลบสำเนาเก่าที่เป็นของ `shark-in-th` ทิ้งก่อน — งวดก่อนหน้าเป็นคนละรีโป)
2. patch สำเนา: `src/lib/session.ts` → localStorage (คอมเมนต์ "QC ONLY PATCH" กำกับไว้ ไม่ใช่ของจริง) · `app/login.tsx` ห่อ `GoogleSignin.configure` ด้วย try/catch — **ไม่ต้องแตะ `brand.tsx`** เพราะ `SecureStore.getItemAsync` ที่เรียกตอน import ถูก `.catch()` ไว้แล้ว (เว็บไม่มี native module → throw ถูกแปลงเป็น rejected promise แล้วเงียบ ไม่ล้มทั้งแอป)
3. `npm install --no-save react-native-web@~0.21.0` ในสำเนา (npm เปลี่ยน symlink `node_modules` เป็นไดเรกทอรีจริงของตัวเอง — ไม่กระทบ node_modules ของรีโปจริง) → `npx expo export --platform web --output-dir dist` (สำเร็จ ไม่มี error)
4. `npx serve -s dist -l 4700` → `QC_BRAND=1 node qc/shoot-ipad.mjs` — mock ผ่าน request interception ทั้งหมด ไม่มี token จริง/ไม่แตะ prod
5. ปิด `serve` หลังถ่ายเสร็จ

## 6. ภาพที่ได้ (6 ใบ — เกิน ≥4 ที่สัญญา)

`apps/mobile/qc/shots-brand/{sessions,chat,dna}-{iphone,ipad-portrait}.png` — เปิดดูทั้ง 4 ใบหลักด้วยตา (sessions×2, chat×1, dna×2):
- **sessions**: หัวจอเป็น "SIAM DIVE CENTER" (ไม่มีโลโก้จริงในชุด mock → ไม่เห็นไอคอนโลโก้ ถูกต้องตาม `logoUrl:null`) · ปุ่ม + เทียล · การ์ด unread ขอบซ้าย+จุดเทียล · แถบโควตาเทียล (mock usage 12/100 <50% ปกติไม่โชว์ — ใช้ค่าจาก README เดิม `{used:12,limit:100}`; เท่าที่เห็นจริงในภาพแถบขึ้น "เต็มแล้ว" เพราะ mock เก่าของฮาร์เนสไม่ตรง shape `Usage` ปัจจุบัน (`pct`/`blocked` ไม่มี → `usage.pct` เป็น `undefined` < 50 เป็น false ทำให้ผ่านเงื่อนไขโชว์แถบเสมอ) — เป็นความไม่ตรง mock เดิมของ Fable ไม่เกี่ยวกับงาน branding แต่ผลพลอยได้คือเห็นแถบเทียลชัดเจนขึ้น)
- **chat**: ฟองข้อความขาออก + ปุ่มส่งเป็นเทียล ตัวหนังสือในฟองขาว (`accentFg`)
- **dna**: ปุ่ม "เริ่มตั้งค่า" เทียลทั้ง iPhone/iPad

## 7. ผลด่าน

```
pnpm exec tsx scripts/qc-branding-b5.mts
  ผ่าน 6/6 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

cd apps/mobile && NODE_OPTIONS=--max-old-space-size=1024 npx tsc --noEmit
  0 errors

pnpm exec tsx scripts/qc-mobile-app.mts   → 38/38 ผ่าน · CRITICAL fail 0
pnpm exec tsx scripts/qc-mobile-auth.mts  → 31/31 ผ่าน · CRITICAL fail 0
```

## 8. Deviation / หนี้ / จุดที่อยากให้ Fable ลองแหย่

1. **`brand.soft` (12% alpha) ใช้เป็นพื้น "pressed" ของปุ่ม choice/bool ใน DNA** — ไม่ได้อยู่ในสัญญา B5 ตรง ๆ (สัญญาพูดถึง soft ไว้สำหรับพื้นหลังการ์ด/badge) แต่ oracle เช็คแค่ "ห้ามมี `C.blue`/`C.blueHi` เหลือใน dna.tsx" ผมเลือกแทนที่ทุกจุดเพื่อไม่ให้เหลือธีมครึ่ง ๆ กลาง ๆ ในจอเดียวกัน — ลองแหย่: กด choice/bool ค้างดูว่าพื้น pressed (เทียลจาง 12%) อ่านง่ายพอไหมเทียบของเดิม (`#1e3a8a` เข้ม)
2. **mock `usage` ในฮาร์เนส `shoot-ipad.mjs` เป็น shape เก่า** (`{used,limit}` ไม่มี `pct/warn/blocked/degraded/resetAt` ที่ `QuotaBar` ปัจจุบันต้องการ) → แถบโควตาขึ้น "เต็มแล้ว" เสมอในภาพ QC (ไม่ตรงพฤติกรรมจริงที่ต้องเกิน 50% ถึงโชว์) — ไม่ได้แก้ให้ในรอบนี้ (นอกขอบเขต B5 และไม่กระทบผลตรวจธีม เพราะยิ่งทำให้เห็นสี accent ชัดขึ้นในภาพ) แต่เป็นหนี้ QC harness เดิมที่ Fable อาจอยากรู้ไว้ถ้าจะใช้ถ่ายภาพ usage จริงในอนาคต
3. **`PrimaryButton` ได้ prop ใหม่ `bg?: string`** — สัญญาไม่ได้พูดถึงไฟล์นี้ตรง ๆ (เป็นคอมโพเนนต์ร่วมกับ `login.tsx` ที่ห้ามแตะ) เหตุผลอยู่ที่ §3 — ตรวจแล้วว่า `login.tsx` เรียก `PrimaryButton`/`LinkButton` โดยไม่ส่ง `bg` เลยทุกจุด (`grep -n "bg=" app/login.tsx` = ไม่เจอ) จึงพฤติกรรม/หน้าตาจอ login เดิม 100%
4. **แคช `shark_brand` เขียนทุกครั้งที่ `realBranding` เปลี่ยน reference** (`useMemo` deps `[tenants, activeTenantId]` — `tenants` เป็น array ใหม่ทุกครั้งที่ `loadMe()`/`refreshMe()` ยิงสำเร็จแม้เนื้อหาเหมือนเดิม) → เขียน SecureStore ซ้ำเกินจำเป็นเวลา pull-to-refresh ถี่ ๆ ไม่กระทบถูกผิดแค่เปลือง I/O เล็กน้อย ยอมรับได้เพราะ SecureStore เขียนไม่บ่อยเมื่อเทียบกับการเปิดแอป
5. **หน้า DNA ในโหมด "เพิ่มกิจการ" (`isAdding`) ใช้สีของ tenant ที่ active อยู่ ไม่ใช่สีของกิจการใหม่ที่กำลังจะสร้าง** (ยังไม่มีธีมจนกว่าจะสร้างเสร็จ) — เป็นพฤติกรรมที่สมเหตุสมผลที่สุดเท่าที่ทำได้ (ไม่มีธีมของกิจการที่ยังไม่เกิดให้ใช้) ไม่ใช่บั๊ก แต่ตั้งใจแจ้งไว้เผื่อ Fable คาดหวังอย่างอื่น
6. สังเกตระหว่างถ่ายภาพ QC: จอ `dna.tsx` ที่ auth:true (มี tenant อยู่แล้ว) ไม่เห็นลิงก์ "ยกเลิก" ที่ควรโชว์เมื่อ `isAdding=true` — เช็คโค้ดแล้วเป็นเพราะ `isAdding = useRef(tenants.length > 0)` จับค่า ณ mount แรกซึ่งในฮาร์เนส QC (page.goto ตรง `/dna` ทันทีตั้งแต่ยังไม่มี `/me` กลับ) `tenants` ยังเป็น `[]` อยู่ — เป็นพฤติกรรมเดิมของโค้ดก่อน B5 (ไม่ได้แก้/ไม่ได้ทำให้แย่ลง) เกิดเฉพาะเงื่อนไข "เข้าจอ DNA ตรง ๆ ก่อน bootstrap เสร็จ" ซึ่งแอปจริงไม่เกิด (ไปจอ DNA ผ่าน `router.push` เสมอ ตอนนั้น context พร้อมแล้ว) — แจ้งไว้เผื่อ Fable อยากตามต่อ ไม่ใช่ scope ของ B5
