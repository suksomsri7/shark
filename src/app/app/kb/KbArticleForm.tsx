import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";

// ฟอร์มบทความคลังความรู้ (ใช้ทั้งสร้างและแก้ไข) — server component + server action
type Props = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  defaults?: { id?: string; title?: string; body?: string; category?: string | null };
  serverError?: string;
};

const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

export function KbArticleForm({ action, submitLabel, defaults, serverError }: Props) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {defaults?.id && <input type="hidden" name="id" defaultValue={defaults.id} />}

      <FormField label="หัวข้อ" required>
        <input
          name="title"
          required
          defaultValue={defaults?.title ?? ""}
          placeholder="เช่น นโยบายการคืนสินค้า"
          className={inputCls}
        />
      </FormField>

      <FormField label="หมวด" hint="จัดกลุ่มบทความให้ค้นง่าย (ไม่บังคับ)">
        <input
          name="category"
          defaultValue={defaults?.category ?? ""}
          placeholder="เช่น นโยบายร้าน, การจัดส่ง"
          className={inputCls}
        />
      </FormField>

      <FormField label="เนื้อหา" required>
        <textarea
          name="body"
          required
          rows={10}
          defaultValue={defaults?.body ?? ""}
          placeholder="เขียนความรู้ / คำตอบ / ขั้นตอน ให้ทีมและผู้ช่วย AI ใช้ตอบลูกค้า"
          className={inputCls}
        />
      </FormField>

      {serverError && (
        <p className="text-sm text-[color:var(--color-danger)]">{serverError}</p>
      )}

      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export default KbArticleForm;
