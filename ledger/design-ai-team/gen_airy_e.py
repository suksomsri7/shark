# Liquid Glass · Airy — ชุด จ. ห้องแผนก E1–E4 (AI หลายตัวส่งงานต่อกัน) · เจ้าของสั่งเพิ่ม 1 ต.ค.
src=open('gen_airy_full.py').read().split('\nPAGES={')[0]
exec(src)

CSS+=r'''
/* ---- เพิ่มสำหรับชุด จ. ---- */
body{height:1620px}
.lv{font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:14px;white-space:nowrap;flex:none}
.lv.g{background:rgba(60,196,127,.12);color:#23945a}.lv.w{background:rgba(255,176,32,.14);color:#b27400}
.who{font-size:14px;font-weight:600}.who em{font-style:normal;font-weight:400;color:#8e8e93}
.stp .h b{color:#8f9bff}.stp.q{color:#aeaeb2}.stp.q b{color:#c5c8d4}
.un{width:26px;height:26px;border-radius:50%;border:2px solid #c5c8d4;flex:none}
.no{width:16px;font-size:13px;color:#8e8e93;flex:none;text-align:center}
'''

# ---------- E1 รายการห้องแผนก ----------
def rm(orbs,n,s,r,cls=''): return f'<div class="row">{stk(*[AO(o) for o in orbs])}<div class="t"><b>{n}</b><span class="{cls}">{s}</span></div><div class="r">{r}</div></div>'
rooms=f'''<div class="pg">{bar(r=PLUS+stk(HP('h1','ส'),HP('h2','น'),AO('o1'),AO('o2'),MORE(4)))}
 <div class="lt">The Bean Café {CH}</div><div class="st">คน 3 · พนักงาน AI 5 · แพ็ก Pro</div>
 <div style="margin-top:22px">{seg(['พนักงาน 5','ห้องแผนก 3'],1)}</div>
 <div class="st" style="margin-top:18px;color:#6e6e73">สั่งครั้งเดียว พนักงานหลายคนส่งงานต่อกันเอง</div>
 <div style="margin-top:6px">
 {rm(['o1','o3','o2'],'ฝ่ายขาย','ปิดดีลร้านดอยช้าง · ขั้น 2 จาก 4','9:41<span class=bd>1</span>','amb')}
 {rm(['o2','o5'],'หน้าร้าน &amp; ลูกค้า','ตอบแชท 3 ห้อง · คูปองวันเกิด 18:00','ตอนนี้')}
 {rm(['o4','o5','o2'],'การตลาด','แคมเปญ ต.ค. · ร่างโพสต์ 4 จาก 6','8:15')}
 <div class="row" style="background:none;box-shadow:none;border:1.5px dashed #c5c7d6 !important;justify-content:center;color:#8e8e93;font-size:15px;font-weight:500">＋ สร้างห้องแผนก</div>
 </div>
 <div class="sec">ระบบแนะนำ</div>
 {it('💡','งานที่ส่งต่อกันบ่อย','คุณเอก → พลอยใส 6 ครั้งในเดือนนี้','ตั้งลำดับ')}
 </div>'''

# ---------- E2 ห้องแผนก (ส่งงานต่อกัน) ----------
def who(c,n,role,body): return f'<div class="aiw" style="margin-top:22px">{av(c,"",32)}<div class="x"><div class="who">{n} <em>· {role}</em></div>{body}</div></div>'
droom=f'''<div class="pg">{bar(BACK,'ฝ่ายขาย<small>ปิดดีลร้านดอยช้าง · ขั้น 2 จาก 4</small>',stk(AO('o1'),AO('o3'),AO('o2'),HP('h1','ส')))}
 <div class="ubb">ร้านดอยช้างตกลงซื้อแล้ว ปิดดีล ออกใบแจ้งหนี้ แล้วนัดส่งของให้ด้วย</div>
 {who('a1','คุณเอก','เซลส์','<div class="stp"><div><b>✓</b>ย้ายดีลเป็น "ปิดการขาย" ฿11,200</div><div class="h"><b>→</b>ส่งต่อให้พลอยใส พร้อมใบเสนอราคา Q-0012</div></div>')}
 {who('a3','พลอยใส','บัญชี','<div class="stp"><div><b>✓</b>ออกใบแจ้งหนี้จาก Q-0012</div></div><div class="apc" style="margin-top:8px"><div class="tg">รออนุมัติ</div><div class="h"><b>ใบแจ้งหนี้ INV-0232</b><span class="m">฿11,200</span></div><div class="s">คุณสมชาย · ครบกำหนด 15 ต.ค.</div><div class="acts"><div>แก้</div><div class="d">อนุมัติและส่งต่อ</div></div></div>')}
 {who('a2','น้องมะลิ','แอดมินแชท','<div class="stp q"><div><b>○</b>รอ: ส่งใบแจ้งหนี้ + นัดวันส่งของทาง LINE</div></div>')}
 </div>{INP('สั่งงานต่อในห้องนี้…')}'''

# ---------- E3 สร้างห้องแผนก ----------
def pk(o,n,role,on=True,tag=''): return f'<div class="row cp">{AO(o)}<div class="t"><b>{n}<em>{role}</em>{tag}</b></div>{CK if on else "<div class=un></div>"}</div>'
newroom=f'''<div class="pg">{bar(BACK,'',PILL('สร้าง'))}
 <div class="lt">ห้องแผนกใหม่</div><div class="st">รวมพนักงานที่ต้องส่งงานต่อกัน ไว้สั่งในที่เดียว</div>
 <div class="fl">ชื่อห้อง</div><div class="fld" style="font-size:17px">ฝ่ายขาย</div>
 <div class="sec" style="margin-top:26px">พนักงาน AI ในห้อง</div>
 {pk('o1','คุณเอก','เซลส์',True,'<i class="tagp" style="font-style:normal">รับงานก่อน</i>')}
 {pk('o3','พลอยใส','บัญชี')}
 {pk('o2','น้องมะลิ','แอดมินแชท')}
 {pk('o4','ไอดิน','คอนเทนต์',False)}
 <div class="sec" style="margin-top:26px">คนที่สั่งงานห้องนี้ได้</div>
 <div class="row cp">{stk(HP('h1','ส'),HP('h2','น'))}<div class="t"><b class="n">คุณสุข · คุณนิด</b></div>{AR}</div>
 <div class="note">แต่ละคนยังใช้สิทธิ์และคู่มือของตัวเอง<br>ห้องแผนกไม่ได้เพิ่มสิทธิ์ให้ใคร</div>
 </div>'''

# ---------- E4 ลำดับส่งต่องาน ----------
def stepr(i,o,n,task,lv,g=True): return f'<div class="row cp"><span class="no">{i}</span>{AO(o)}<div class="t"><b>{n}</b><span>{task}</span></div><span class="lv {"g" if g else "w"}">{lv}</span></div>'
flow=f'''<div class="pg">{bar(BACK,'',PILL('บันทึก'))}
 <div class="lt">ลำดับส่งต่องาน</div><div class="st">ฝ่ายขาย · เริ่มเมื่อดีลปิดการขาย</div>
 <div style="margin-top:12px">
 {stepr(1,'o1','คุณเอก','ย้ายดีล + สรุปเงื่อนไข','ทำเองได้')}
 {stepr(2,'o3','พลอยใส','ออกใบแจ้งหนี้จากใบเสนอราคา','รออนุมัติ',False)}
 {stepr(3,'o2','น้องมะลิ','ส่งใบแจ้งหนี้ + นัดส่งทาง LINE','ทำเองได้')}
 {stepr(4,'o1','คุณเอก','ตั้งเตือนติดตามหลังส่ง 7 วัน','ทำเองได้')}
 <div class="row cp" style="color:#5a64d8;font-weight:600;font-size:15.5px;justify-content:center">＋ เพิ่มขั้น</div>
 </div>
 <div class="sec" style="margin-top:26px">ถ้าขั้นไหนติด</div>
 {it('🙋','หยุดแล้วถามคนที่สั่งงาน','ไม่ข้ามขั้นเอง',arrow=False,right=tgl(True))}
 {it('⏰','ไม่มีใครอนุมัติใน 4 ชม.','เตือนซ้ำ แล้วส่งต่อให้เจ้าของ')}
 <div class="note">ระบบร่างลำดับนี้จากงานที่ทำซ้ำ 6 ครั้ง · แก้ได้ทุกขั้น</div>
 </div>'''

P=[(rooms,'E1 · ห้องแผนกทั้งหมด'),(droom,'E2 · ห้องแผนก (ส่งงานต่อกัน)'),(newroom,'E3 · สร้างห้องแผนก'),(flow,'E4 · ลำดับส่งต่องาน')]
html=f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="title"><h1>SHARK · ทีมพนักงาน AI — จ. ห้องแผนก</h1><p>Liquid Glass · Airy · สั่งครั้งเดียว พนักงาน AI หลายคนส่งงานต่อกัน (E1–E4)</p></div>
<div class="phones">{''.join(phone(b,l) for b,l in P)}</div></body></html>'''
open('ai-team-airy-e.html','w').write(html)
print('ok')
