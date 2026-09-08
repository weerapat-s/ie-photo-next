"use client";
// components/panels/studio-panel.tsx — จัดการห้องสตูดิโอ (แท็บใน /resources)
// ฝั่งแอดมินไม่ต้องมีปุ่มจอง — ใช้การ์ดใบเดียวกับหน้าสมาชิกแต่เปิดโหมดแก้ไข
import { useState } from "react";
import { collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { Spinner, EmptyState, Badge, Button } from "@/components/ui";
import { StudioEditModal } from "@/components/studio";
import Icon from "@/components/icon";
import { stripEmoji } from "@/lib/format";
import type { StudioDoc, WithId } from "@/lib/types";

export default function StudioPanel() {
  const { data: studios, loading } = useCollection<StudioDoc>(
    () => query(collection(db, "studios"), orderBy("name")),
    []
  );
  const [editing, setEditing] = useState<WithId<StudioDoc> | null>(null);

  if (loading) return <Spinner />;
  if (studios.length === 0) {
    return <EmptyState icon="studio" text="ยังไม่มีห้องสตูดิโอในระบบ — เพิ่มได้ด้วยสคริปต์ seed" />;
  }

  return (
    <div>
      <p className="t-body mb-4 text-[var(--muted-ink)]">
        <b className="t-num text-[var(--ink)]">{studios.length}</b> ห้อง · เปิดให้จอง{" "}
        <b className="t-num text-[var(--ink)]">{studios.filter((s) => s.status === "open").length}</b>
      </p>

      {/* รายการแบบแถว ไม่ใช่การ์ดใบใหญ่ — อ่านเทียบกันง่ายกว่าและกินพื้นที่น้อยกว่า */}
      <ul className="surface-flat divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
        {studios.map((s) => (
          <li key={s.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="t-heading text-[var(--ink)]">{s.name}</h3>
                  <Badge className={s.status === "open" ? "tone-ok" : "tone-mute"}>
                    {s.status === "open" ? "เปิดให้จอง" : "ปิด"}
                  </Badge>
                </div>
                <p className="t-body text-[var(--muted-ink)]">{s.subtitle}</p>
                {s.tags?.length > 0 && (
                  <p className="t-caption mt-1 truncate">{s.tags.map(stripEmoji).join(" · ")}</p>
                )}
                <p className="t-caption mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="time" size={16} /> {s.openHours}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="phone" size={16} /> {s.contactPhone}
                  </span>
                </p>
              </div>
              <Button size="sm" variant="outline" icon="edit" onClick={() => setEditing(s)}>
                แก้ไข
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editing && <StudioEditModal studio={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
