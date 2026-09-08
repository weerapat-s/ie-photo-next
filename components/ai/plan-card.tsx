"use client";
// components/ai/plan-card.tsx — การ์ดแสดงแผนที่ AI เสนอ ก่อนกดยืนยัน
//
// แยกออกมาจากตัวแชทเพราะแต่ละชนิดแอ็กชันต้องแสดงคนละแบบ
// สิ่งที่ต้องเห็นก่อนกดยืนยันเสมอ: ใคร · งานอะไร · ชนวันไหนไหม · ทำไม
import { Badge, Button } from "@/components/ui";
import Icon, { type IconName } from "@/components/icon";
import { displayName } from "@/lib/roles";
import { shortDay } from "@/lib/availability";
import { fmtRange } from "@/lib/format";
import { conflictDays } from "@/lib/ai/context";
import type { ResolvedAction } from "@/lib/ai/plan";
import type { AvailabilityDoc, WithId } from "@/lib/types";

const KIND: Record<ResolvedAction["type"], { icon: IconName; label: string }> = {
  assign: { icon: "assign", label: "มอบหมายงาน" },
  create_task: { icon: "task", label: "สร้างงานย่อย" },
  update_person: { icon: "user", label: "เพิ่มข้อมูลสมาชิก" },
};

export default function PlanCard({
  summary,
  actions,
  availability,
  applied,
  busy,
  onApply,
}: {
  summary?: string;
  actions: ResolvedAction[];
  availability: WithId<AvailabilityDoc>[];
  applied?: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  return (
    <div className="surface-raised rounded-2xl p-3.5">
      <p className="t-label mb-2 flex items-center gap-1.5 text-[var(--ink)]">
        <Icon name="empty" size={16} className="text-[var(--faculty)]" />
        แผนที่เสนอ{applied ? " · บันทึกแล้ว" : ""}
      </p>
      {summary && <p className="t-caption mb-2">{summary}</p>}

      <ul className="space-y-2">
        {actions.map((a, i) => (
          <li key={i} className="surface-sunken rounded-xl p-3">
            <p className="t-caption mb-1 flex items-center gap-1.5 font-semibold">
              <Icon name={KIND[a.type].icon} size={16} className="text-[var(--faculty)]" />
              {KIND[a.type].label}
            </p>

            {a.type === "assign" && (
              <>
                <p className="t-label text-[var(--ink)]">{a.booking.usageType || a.booking.itemName}</p>
                <p className="t-caption">{fmtRange(a.booking.startAt, a.booking.endAt)}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {a.users.map((u) => {
                    const clash = conflictDays(
                      availability,
                      u.id,
                      a.booking.startAt.toMillis(),
                      a.booking.endAt.toMillis()
                    );
                    return (
                      <Badge key={u.id} className={clash.length ? "tone-warn" : "tone-ok"}>
                        {displayName(u)}
                        {clash.length > 0 && ` · ติด ${clash.map(shortDay).join(", ")}`}
                      </Badge>
                    );
                  })}
                </div>
              </>
            )}

            {a.type === "create_task" && (
              <>
                <p className="t-label text-[var(--ink)]">{a.title}</p>
                {a.description && <p className="t-caption">{a.description}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge className="tone-brand">{displayName(a.assignee)}</Badge>
                  {a.dueDate && <Badge className="tone-mute">ส่ง {shortDay(a.dueDate)}</Badge>}
                </div>
              </>
            )}

            {a.type === "update_person" && (
              <>
                <p className="t-label text-[var(--ink)]">{displayName(a.user)}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(a.firstName || a.lastName) && (
                    <Badge className="tone-brand">
                      ชื่อ → {[a.firstName ?? a.user.firstName, a.lastName ?? a.user.lastName].filter(Boolean).join(" ")}
                    </Badge>
                  )}
                  {a.nickname && <Badge className="tone-brand">ชื่อเล่น → {a.nickname}</Badge>}
                  {a.phone && <Badge className="tone-brand">เบอร์ → {a.phone}</Badge>}
                  {a.role && (
                    <Badge className="tone-bad">
                      สิทธิ์ → {a.role === "super_admin" ? "ประธาน" : a.role === "admin" ? "กรรมการ" : "สมาชิก"}
                    </Badge>
                  )}
                  {a.skills?.map((s) => (
                    <Badge key={s} className="tone-ok">
                      ถนัด {s}
                    </Badge>
                  ))}
                  {a.seniority && <Badge className="tone-brand">ประสบการณ์ {a.seniority}/5</Badge>}
                  {a.note && <Badge className="tone-mute">{a.note}</Badge>}
                </div>
              </>
            )}

            {a.why && <p className="t-caption mt-1.5">เหตุผล: {a.why}</p>}
          </li>
        ))}
      </ul>

      {!applied && (
        <Button className="mt-3" icon="approved" fullWidth loading={busy} onClick={onApply}>
          ยืนยันให้ AI ดำเนินการ ({actions.length} รายการ)
        </Button>
      )}
    </div>
  );
}
