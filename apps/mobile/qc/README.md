# QC เรนเดอร์จอแอปบน iPad โดยไม่ต้อง build (Fable · 6 ก.ย. 2026)
1. สำเนา: `rsync -a --exclude node_modules --exclude dist --exclude credentials* ./ /root/qc-shark-mobile/` + symlink node_modules
2. patch สำเนา: `src/lib/session.ts` → localStorage · `app/login.tsx` ห่อ `GoogleSignin.configure` ด้วย try/catch
3. `npm install --no-save react-native-web@~0.21.0` (ใน apps/mobile · ไม่แตะ package.json) · `npx expo export --platform web --output-dir dist`
4. `npx serve -s dist -l 4700` แล้ว `node qc/shoot-ipad.mjs` — API ถูก mock ทั้งหมดผ่าน puppeteer request interception (ต้องใส่ CORS headers ไม่งั้น fetch ล้มเงียบ) · ไม่ใช้ token จริง
5. ภาพ: login/sessions/chat/dna × iPad 820×1180 · 1180×820 · 1024×1366 · iPhone 390×844
ข้อจำกัด: หน้า dashboard (WebView) เรนเดอร์บนเว็บไม่ได้ → ดูจากเว็บ /app ที่ขนาด iPad แทน · 🔴 ห้าม `pkill -f` ด้วยสตริงที่อยู่ในคำสั่งตัวเอง (ฆ่า shell ตัวเอง)
