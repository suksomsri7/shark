# 03 — AI Layer

สเปคหลักที่บังคับใช้อยู่: **[docs/AI_LAYER.md](../AI_LAYER.md)** (kernel/provider/persona/tools/proposals/interview/growth — เขียนตอนสร้างจริง ถือเป็นแหล่งจริงของชั้นนี้)

## ส่วนขยายตาม Master Queue
- **WO-0045** actions ×10 — ทุกตัวเดินเส้น proposal→confirm→execute เดิม + permission string ของโมดูลปลายทาง
- **WO-0046** AI นักวิเคราะห์ — cron รายสัปดาห์ + on-demand · ใช้ read tools เดิมรวบรวมข้อมูล → LLM เรียบเรียง · ห้ามแต่งตัวเลข (ทุกเลขมาจาก tool result)
- **WO-0047** triage เคส support ฝั่ง backoffice (ร่างให้คนกดส่ง)
- **WO-0048** DNA ต่อเนื่อง — เทียบ DnaFacts กับข้อมูลจริง (จำนวนสาขา/ระบบที่ใช้) → เสนออัปเดตผ่าน proposal

## กติกาถาวรของชั้นนี้ (ห้ามละเมิดในทุก WO)
1. mutation ทุกตัวของ AI = proposal เท่านั้น (user ตัดสินใจ)
2. tool result เป็น JSON ไทยจากข้อมูลจริง — LLM ห้ามเป็นแหล่งตัวเลข
3. MockProvider/Scripted ใน oracle เสมอ — พฤติกรรม test=prod (ห้าม gate ด้วย env)
4. cost guard ต่อ tenant/วัน · usage รวมทุกรอบ agent loop
