# Liquid Glass · Airy — ชุด ง. หน้าใหม่ D1–D8 (เสนอ 1 ต.ค.)
# เริ่มใช้ครั้งแรก · โควตาหมด · ตีกลับ+สอนงาน · เลื่อนขั้น · รายงานทีม · มุมมองผู้อนุมัติ
# ใช้ CSS + ตัวช่วยทั้งหมดจาก gen_airy_full.py (ตัดส่วนเขียนไฟล์ออก)
src=open('gen_airy_full.py').read().split('\nPAGES={')[0]
exec(src)

CSS+=r'''
/* ---- เพิ่มสำหรับชุด ง. ---- */
.lk{font-size:13.5px;font-weight:600;padding:8px 16px;border-radius:16px;background:#16161c;color:#fff;white-space:nowrap}
.okt{font-size:13.5px;font-weight:600;color:#3cb577;white-space:nowrap}
.flag{font-size:13.5px;font-weight:500;margin-top:10px;padding:8px 12px;border-radius:12px;line-height:1.5}
.flag.g{background:rgba(60,196,127,.12);color:#23945a}.flag.w{background:rgba(255,176,32,.14);color:#b27400}
.sheet .nums{margin-top:18px !important}
'''

def prog3(n): return '<div class="prog">'+''.join('<i></i>' if i<n else '<i class="n"></i>' for i in range(3))+'</div>'
LK=lambda t: f'<span class="lk">{t}</span>'
SHARE='<div class="ib"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 14v5h14v-5"/></svg></div>'

# ---------- เริ่มใช้ครั้งแรก ----------
welcome=f'''<div class="pg">{bar()}
 <div class="cl" style="margin-top:56px"><div class="ao o2" style="width:104px;height:104px;left:98px;top:46px"></div><div class="ao o1" style="width:138px;height:138px;left:178px;top:6px"></div><div class="ao o3" style="width:96px;height:96px;left:296px;top:74px"></div></div>
 <div class="hero"><h2 style="margin-top:10px;font-size:30px;line-height:1.35">ทีมพนักงาน AI<br>ของร้านคุณ</h2><p>สั่งงานด้วยการพิมพ์หรือพูด<br>คุณแค่ตรวจและอนุมัติ</p></div>
 <div style="margin-top:40px">
 {it('⚡','เริ่มงานได้ทันที','ไม่ต้องสอนวิธีใช้ระบบ',arrow=False)}
 {it('🧠','ความรู้อยู่กับร้าน','คู่มืองานไม่หาย แม้พนักงานลาออก',arrow=False)}
 {it('✅','คุณคุมทุกอย่าง','งานเรื่องเงินและงานถึงลูกค้า รออนุมัติก่อน',arrow=False)}
 </div>
 </div><div class="foot" style="flex-direction:column;gap:16px;bottom:34px"><div class="btn1" style="flex:none">เริ่มใช้ฟรี</div><div class="note" style="margin:0">ฟรี 50 งานต่อเดือน · ไม่ต้องใส่บัตร<br><b style="color:#16161c;font-weight:600">มีบัญชี SHARK แล้ว · เข้าสู่ระบบ</b></div></div>'''

create=f'''<div class="pg">{bar(BACK,'ขั้น 1 จาก 3')}
 {prog3(1)}
 <div class="lt">กิจการของคุณ</div><div class="st">พนักงาน AI จะรู้จักร้านจากข้อมูลนี้ · แก้ทีหลังได้</div>
 <div class="fl">ชื่อกิจการ</div><div class="fld" style="font-size:17px">Sweet Studio</div>
 <div class="fl">ประเภท</div><div class="chips" style="flex-wrap:wrap;margin-top:0"><span class="a">คาเฟ่ · ร้านอาหาร</span><span>ค้าปลีก</span><span>บริการ</span><span>ที่พัก · ท่องเที่ยว</span><span>อื่น ๆ</span></div>
 <div class="sec" style="margin-top:28px">เชื่อมต่อ ให้ AI เริ่มงานได้เลย</div>
 {it('💬','LINE OA','@sweetstudio',arrow=False,right='<span class="okt">✓ เชื่อมแล้ว</span>')}
 {it('📘','Facebook · Instagram','ตอบแชทและคอมเมนต์',arrow=False,right=LK('เชื่อม'))}
 {it('📦','สินค้า &amp; ราคา','ไฟล์ Excel หรือถ่ายรูปเมนู',arrow=False,right=LK('เพิ่ม'))}
 <div class="note">ข้ามได้ · เชื่อมเพิ่มทีหลังในเมนู</div>
 </div><div class="foot"><div class="btn1">ถัดไป</div></div>'''

quick=f'''<div class="pg">{bar(BACK,'ขั้น 2 จาก 3')}
 {prog3(2)}
 <div class="lt">จ้างคนแรก</div><div class="st">แนะนำจากสิ่งที่ร้านเชื่อมไว้ · พร้อมทำงานทันที</div>
 <div class="row" style="border:2px solid #16161c;margin-top:20px">{av('a2','',56)}<div class="t"><b>แอดมินตอบแชท<i class="tagp" style="font-style:normal">แนะนำ</i></b><span>ตอบ LINE ตลอด 24 ชม. · รอตอบอยู่ 12 ห้อง</span></div></div>
 <div class="sec" style="margin-top:24px">ตั้งค่าจากแม่แบบให้แล้ว</div>
 {it('🙂','น้องมะลิ','ผู้หญิง · สุภาพ · ตอบสั้น','แก้')}
 {it('📖','คู่มือการทำงาน','6 หัวข้อ จากแม่แบบร้านคาเฟ่','แก้')}
 {it('🔐','แชทลูกค้า','ร่างคำตอบ + รออนุมัติ','แก้')}
 <div class="sec" style="margin-top:24px">ตำแหน่งอื่น</div>
 <div class="row cp">{AO('o3')}<div class="t"><b class="n">ผู้ช่วยบัญชี</b></div>{AR}</div>
 <div class="row cp">{AO('o4')}<div class="t"><b class="n">คอนเทนต์ · โซเชียล</b></div>{AR}</div>
 </div><div class="foot"><div class="btn2">ปรับละเอียด</div><div class="btn1">จ้างเลย</div></div>'''

# ---------- โควตาหมด (แพ็กฟรีเต็ม) ----------
out=f'''<div class="pg">{bar(r=PLUS+stk(HP('h1','ส'),AO('o2')))}
 <div class="lt">Sweet Studio {CH}</div><div class="st">คน 1 · พนักงาน AI 1 · แพ็กฟรี</div></div>
 <div class="dim"></div>
 <div class="sheet" style="top:452px"><div class="grab"></div>
  <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">โควตาเดือนนี้หมดแล้ว</div>
  <div class="st">แพ็กฟรี · ใช้ครบ 50 งาน · รอบใหม่ 1 พ.ย. (อีก 12 วัน)</div>
  <div class="ub" style="margin-top:16px"><i style="width:100%"></i></div>
  <div class="nums"><div><b>50</b><span>งานที่ทำให้</span></div><div><b>9 ชม.</b><span>เวลาที่ประหยัด</span></div><div><b class="amb">3</b><span>งานค้างอยู่</span></div></div>
  <div class="qt" style="margin-top:14px">น้องมะลิพักงานอยู่ · แชทลูกค้า 3 ห้องยังไม่ได้ตอบ<br>งานที่ค้างจะทำต่อทันทีเมื่อมีโควตา</div>
  {pl3('Starter','฿490',['ประมาณ 800 งานต่อเดือน','งานประจำ 5 งาน · ยกเลิกได้ทุกเมื่อ'],hi=True)}
  <div class="btn1" style="margin-top:18px">อัปเกรดเป็น Starter · ฿490</div>
  <div style="text-align:center;font-size:15px;font-weight:500;color:#6e6e73;margin-top:18px">รอรอบใหม่ 1 พ.ย. &nbsp;·&nbsp; ดูแพ็กทั้งหมด</div>
 </div>'''

# ---------- ตีกลับ + สอนงาน ----------
teach=f'''<div class="pg">{bar(BACK)}
 <div class="lt">ตีกลับงาน</div><div class="st">ใบเสนอราคา Q-0012 ฿12,500 · คุณเอก</div>
 <div class="fl">ผิดตรงไหน</div>
 <div class="chips" style="flex-wrap:wrap;margin-top:0"><span class="a">ราคา</span><span>ส่วนลด</span><span>ข้อมูลลูกค้า</span><span>น้ำเสียง</span><span>อื่น ๆ</span></div>
 <div class="fl">บอกคุณเอกเพิ่ม · พิมพ์หรือพูด</div><div class="fld ml">ร้านดอยช้างเป็นลูกค้าประจำ ต้องใช้ราคาส่ง ไม่ใช่ราคาปลีก</div>
 <div class="qt" style="margin-top:16px"><div style="font-size:12.5px;font-weight:600;color:#6a5ad8;margin-bottom:4px">💡 คุณเอกเข้าใจว่า</div>ลูกค้าที่ซื้อเกิน 3 ครั้งต่อปี ให้ใช้ราคาส่งครับ ผมจะแก้ Q-0012 เป็น ฿11,200</div>
 <div class="opt"><div class="n">ให้จำไว้ไหม</div>{seg(['เฉพาะงานนี้','จำเป็นกฎในคู่มือ'],1)}</div>
 <div class="dif"><span class="p">+ ลูกค้าประจำ (ซื้อเกิน 3 ครั้งต่อปี) ใช้ราคาส่ง</span><span style="display:block;color:#8e8e93;font-size:12.5px">เพิ่มในหัวข้อ "ขั้นตอนทำงาน" · คู่มือ v3 → v4</span></div>
 <div class="note">สอนครั้งเดียว จำตลอด · ย้อนกลับได้ในประวัติคู่มือ</div>
 </div><div class="foot"><div class="btn1">ส่งกลับให้แก้ + บันทึกกฎ</div></div>'''

# ---------- เลื่อนขั้น: ปล่อยให้ทำเอง ----------
promo=f'''<div class="pg">{bar(r=CLOSE)}
 <div class="hero" style="margin-top:40px"><div class="ao o1 halo" style="width:116px;height:116px"></div>
  <h2 style="margin-top:52px">คุณเอกพร้อมทำเองแล้ว</h2><p>งาน: ส่งใบเสนอราคาให้ลูกค้า</p></div>
 <div class="nums"><div><b>50</b><span>งานล่าสุด</span></div><div><b class="grn">96%</b><span>ผ่านไม่ต้องแก้</span></div><div><b>0</b><span>ตีกลับ 30 วัน</span></div></div>
 <div class="opt" style="margin-top:24px"><div class="n">ระดับสิทธิ์</div>{seg(['ร่าง + รออนุมัติ','ทำเองได้'],1)}</div>
 <div class="sec" style="margin-top:24px">ทำเองได้ เฉพาะเมื่อ</div>
 {it('💸','ยอดไม่เกิน ฿20,000','เกินกว่านี้ยังรออนุมัติ',arrow=False,right=tgl(True))}
 {it('🏷','ส่วนลดไม่เกิน 10%','ตามนโยบายส่วนลดของร้าน',arrow=False,right=tgl(True))}
 {it('🔔','แจ้งฉันทุกครั้งที่ส่ง','ยกเลิกได้ภายใน 10 นาที',arrow=False,right=tgl(True))}
 <div class="note">ลดการกดอนุมัติประมาณ 40 ครั้งต่อเดือน<br>ถ้าผ่านต่ำกว่า 90% จะกลับมารออนุมัติเอง</div>
 </div><div class="foot"><div class="btn2">ยังก่อน</div><div class="btn1">ให้ทำเองได้</div></div>'''

# ---------- รายงานผลงานทีม ----------
def rp(o,n,role,s,h,cls=''): return f'<div class="row cp">{AO(o)}<div class="t"><b>{n}<em>{role}</em></b><span class="{cls}">{s}</span></div><span class="v" style="color:#16161c;font-weight:600">{h}</span></div>'
report=f'''<div class="pg">{bar(BACK,'',SHARE)}
 <div class="lt">ผลงานทีม</div><div class="st">The Bean Café · ก.ย. 69 ⌄</div>
 <div class="big" style="margin-top:26px">฿38,520</div>
 <div class="st" style="margin-top:12px;color:#6e6e73">มูลค่างานที่ทีม AI ทำแทน · 214 ชม. × ฿180</div>
 <div class="st grn" style="margin-top:4px">✓ ประมาณ 25 เท่าของค่าแพ็ก ฿1,490</div>
 <div class="grid"><div><b>1,284</b><span>งานเสร็จ</span></div><div><b>214 ชม.</b><span>เวลาที่ประหยัด</span></div><div><b>93%</b><span>ผ่านโดยไม่ต้องแก้</span></div><div><b>11 นาที</b><span>รออนุมัติเฉลี่ย</span></div></div>
 <div class="sec" style="margin-top:22px">รายคน</div>
 {rp('o2','น้องมะลิ','แอดมินแชท','612 งาน · ผ่าน 97%','88 ชม.')}
 {rp('o1','คุณเอก','เซลส์','318 งาน · ผ่าน 94%','52 ชม.')}
 {rp('o3','พลอยใส','บัญชี','206 งาน · ผ่าน 96%','41 ชม.')}
 {rp('o4','ไอดิน','คอนเทนต์','ถูกตีกลับ 18% · ควรปรับคู่มือ','ดู ›','amb')}
 </div>'''

# ---------- มุมมองผู้อนุมัติ (พนักงานคน) ----------
def ap2(c,who,tm,t,amt,d,fc,flag,btn): return f'<div class="it2" style="padding:18px 20px"><div class="w">{av(c,"",26)}{who}<span class="tm" style="width:auto">{tm}</span></div><div class="h"><b>{t}</b><span>{amt}</span></div><p>{d}</p><div class="flag {fc}">{flag}</div><div class="ac"><span>ดู</span><span>ตีกลับ</span><span class="d">{btn}</span></div></div>'
approver=f'''<div class="pg">{bar(r=stk(HP('h2','น')))}
 <div class="lt">The Bean Café</div><div class="st">คุณนิด · ผู้อนุมัติ · วันนี้อนุมัติ 12 · ตีกลับ 1</div>
 <div class="tabs"><span class="a">รอตรวจ 3</span><span>ตรวจแล้ว</span><span>สั่งงาน AI</span></div>
 {ap2('a1','คุณเอก · เซลส์','9:41','ใบเสนอราคา Q-0012','฿11,200','คุณสมชาย · เครื่องชง 2 ชุด','g','✓ ราคาส่ง · ส่วนลดอยู่ในนโยบาย','อนุมัติและส่ง')}
 {ap2('a6','ต้น · จัดซื้อ','9:20','สั่งของจากผู้ขาย 4 รายการ','฿8,400','เมล็ดกาแฟ · นม · แก้ว · ไซรัป','w','⚠ แพงกว่าครั้งก่อน 12% · เมล็ดกาแฟขึ้นราคา','อนุมัติ')}
 {ap2('a2','น้องมะลิ · แอดมินแชท','8:55','ตอบรีวิว 1 ดาว','','"ขออภัยค่ะ กาแฟรอนานเกินไป…"','w','⚠ เสนอคูปองชดเชย ฿50 ให้ลูกค้า','อนุมัติและตอบ')}
 <div class="note">เกิน ฿20,000 ระบบส่งต่อให้เจ้าของอัตโนมัติ</div>
 </div>'''

P=[(welcome,'D1 · เริ่มใช้ครั้งแรก'),(create,'D2 · สร้างกิจการ'),(quick,'D3 · จ้างคนแรก (จ้างด่วน)'),(out,'D4 · โควตาหมด'),
   (teach,'D5 · ตีกลับ + สอนงาน'),(promo,'D6 · เลื่อนขั้น ให้ทำเอง'),(report,'D7 · ผลงานทีม'),(approver,'D8 · มุมมองผู้อนุมัติ')]
html=f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="title"><h1>SHARK · ทีมพนักงาน AI — ง. หน้าใหม่</h1><p>Liquid Glass · Airy · เริ่มใช้ครั้งแรก · โควตาหมด · สอนงาน · เลื่อนขั้น · รายงาน · มุมมองผู้อนุมัติ (D1–D8)</p></div>
<div class="phones">{''.join(phone(b,l) for b,l in P)}</div></body></html>'''
open('ai-team-airy-d.html','w').write(html)
print('ok')
