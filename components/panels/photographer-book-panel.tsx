"use client";
// app/(member)/photographers/page.tsx — เลือกและจองตากล้อง
import { useState } from "react";
import { collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useNow } from "@/lib/hooks";
import { dateKey, crewStatus } from "@/lib/availability";
import { Spinner, EmptyState, ChipBar } from "@/components/ui";
import { PhotographerCard, PhotographerBookingModal } from "@/components/photographer";
import type { AvailabilityDoc, PhotographerDoc, WithId } from "@/lib/types";

type Filter = "all" | "open";

export default function PhotographerBookPanel({ mode = "self" }: { mode?: "self" | "assign" }) {
  const { user, profile } = useAuth();
  const assigning = mode === "assign";
  const { settings } = useSettings();

  const now = useNow(60 * 60_000);

  // วันที่แต่ละคนแจ้งว่าไม่ว่าง — คนละแหล่งกับธง open/closed ของการ์ด
  // ต้องดึงมาเองแล้วจับคู่ด้วย uid ไม่งั้นการ์ดจะบอกว่า "ว่าง" ทั้งที่เจ้าตัวกันวันไว้
  const { data: availability } = useCollection<AvailabilityDoc>(
    () => collection(db, "availability"),
    []
  );

  const { data: crew, loading, error } = useCollection<PhotographerDoc>(
    () => query(collection(db, "photographers"), orderBy("sortOrder")),
    []
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [booking, setBooking] = useState<WithId<PhotographerDoc> | null>(null);

  const todayKey = dateKey(now);
  const busyOf = (uid: string | null) =>
    uid
      ? (availability.find((a) => a.id === uid)?.busyDates ?? []).filter((d) => d >= todayKey).sort()
      : [];

  // "ว่างรับงาน" ต้องหมายถึงว่างจริงวันนี้ ไม่ใช่แค่ธงเปิดค้างไว้
  const shown =
    filter === "open"
      ? crew.filter((c) => !crewStatus(c.status, busyOf(c.uid), now).blocked)
      : crew;

  return (
    <div>

      <ChipBar
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { key: "all", label: "ทั้งหมด", count: crew.length },
          {
            key: "open",
            label: "ว่างวันนี้",
            count: crew.filter((c) => !crewStatus(c.status, busyOf(c.uid), now).blocked).length,
          },
        ]}
      />

      {loading ? (
        <Spinner label="กำลังโหลดทีมงาน…" />
      ) : error ? (
        <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : shown.length === 0 ? (
        <EmptyState icon="photographer" text="ยังไม่มีตากล้องเปิดรับงานในขณะนี้" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((p, i) => (
            <PhotographerCard
              key={p.id}
              p={p}
              index={i}
              busyDates={busyOf(p.uid)}
              onBook={() => setBooking(p)}
              bookLabel={assigning ? "มอบหมายงานให้คนนี้" : undefined}
            />
          ))}
        </div>
      )}

      {!assigning && (
      <p className="mt-8 text-center text-sm text-[var(--muted-ink)]">
        มีคำถามเรื่องคิวงาน? โทร{" "}
        <a href={`tel:${settings.contactPhone.replace(/-/g, "")}`} className="font-semibold text-[var(--faculty)]">
          {settings.contactPhone}
        </a>
      </p>
      )}

      {booking && user && (
        <PhotographerBookingModal
          photographer={booking}
          mode={assigning ? "assign" : "member"}
          user={{
            uid: user.uid,
            name: `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user.email || "",
            phone: profile?.phone ?? "",
          }}
          onClose={() => setBooking(null)}
        />
      )}
    </div>
  );
}
