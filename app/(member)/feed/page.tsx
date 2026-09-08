"use client";
// app/(member)/feed/page.tsx — หน้าแรกของสมาชิก: ทางลัด + ฟีดกิจกรรม
import Link from "next/link";
import { collection, query, orderBy, where, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { isAdminRole } from "@/lib/roles";
import { useSettings } from "@/lib/settings-context";
import { useCollection, useNow } from "@/lib/hooks";
import { PageHeader, Card, Spinner, EmptyState, Section, Badge } from "@/components/ui";
import GlareHover from "@/components/reactbits/GlareHover";
import AnimatedList from "@/components/reactbits/AnimatedList";
import { fmtRelative, fmtRange, BOOKING_STATUS, BOOKING_TYPE_ICON } from "@/lib/format";
import Icon, { IconTile, type IconName } from "@/components/icon";
import type { BookingDoc, FeedDoc } from "@/lib/types";

export default function FeedPage() {
  const { user, profile, role } = useAuth();
  const { settings } = useSettings();
  const now = useNow(60_000);

  const { data: feeds, loading, error } = useCollection<FeedDoc>(
    () => query(collection(db, "feeds"), orderBy("createdAt", "desc")),
    []
  );
  const { data: myBookings } = useCollection<BookingDoc>(
    () => (user ? query(collection(db, "bookings"), where("userId", "==", user.uid)) : null),
    [user?.uid]
  );

  const upcoming = myBookings
    .filter((b) => b.status === "approved" && b.endAt.toMillis() > now)
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
    .slice(0, 3);

  const pendingCount = myBookings.filter((b) => b.status === "pending").length;

  async function toggleLike(f: FeedDoc & { id: string }, liked: boolean) {
    if (!user) return;
    const currentCount = f.likeCount ?? 0;
    await updateDoc(doc(db, "feeds", f.id), {
      likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      likeCount: liked ? currentCount - 1 : currentCount + 1,
    });
  }

  // สมาชิกไม่ได้จองเอง — ทางลัดจึงเป็นสิ่งที่ทำได้จริง: บอกวันว่าง ดูคิว รับงาน รับไฟล์
  // กรรมการเห็นทางลัดไปหน้ามอบหมายแทน
  const shortcuts = (
    isAdminRole(role)
      ? [
          // แผนผังงานมาก่อน — เป็นหน้าที่กรรมการเปิดดูภาพรวมงานทั้งชุมนุมบ่อยสุด
          { href: "/workflow", icon: "workflow", label: "แผนผังงาน", desc: "โครงสร้าง + ติดตามทุกงาน" },
          settings.featureBorrow && { href: "/assign?tab=equipment", icon: "equipment", label: "มอบหมายอุปกรณ์", desc: "ระบุผู้รับผิดชอบ" },
          settings.featureStudio && { href: "/assign?tab=studio", icon: "studio", label: "กันห้องสตูดิโอ", desc: "งานของชุมนุม" },
          settings.featurePhotographer && { href: "/assign?tab=photographer", icon: "photographer", label: "มอบหมายตากล้อง", desc: "เลือกทีมที่ว่าง" },
        ]
      : [
          settings.featureBorrow && { href: "/borrow-equipment", icon: "equipment", label: "ขอยืมอุปกรณ์", desc: "ส่งคำขอ รอกรรมการอนุมัติ" },
          { href: "/availability", icon: "availability", label: "บอกวันไม่ว่าง", desc: "กรรมการเห็นก่อนสั่งงาน" },
          { href: "/calendar", icon: "calendar", label: "ปฏิทินงาน", desc: "คิวที่กำลังจะถึง" },
          settings.featurePhotographer && { href: "/my", icon: "photographer", label: "งานที่เปิดรับ", desc: "กดรับงานถ่าย" },
          settings.featureDeliveries && { href: "/my", icon: "delivery", label: "รับไฟล์งาน", desc: "ลิงก์ NAS" },
        ]
  ).filter(Boolean) as { href: string; icon: IconName; label: string; desc: string }[];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={settings.tagline}
        title={profile?.firstName ? `สวัสดี ${profile.firstName}` : "ยินดีต้อนรับ"}
        subtitle="เลือกสิ่งที่อยากทำได้เลย"
      />

      {/* ── ทางลัด ─────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {shortcuts.map((s, i) => (
          <Link key={s.href} href={s.href} className="animate-in" style={{ animationDelay: `${i * 55}ms` }}>
            <GlareHover className="glass-card press hover-scale h-full rounded-3xl p-4">
              <IconTile name={s.icon} size={20} className="mb-2.5" />
              <p className="t-label text-[var(--ink)]">{s.label}</p>
              <p className="t-caption">{s.desc}</p>
            </GlareHover>
          </Link>
        ))}
      </div>

      {/* ── การจองที่กำลังจะถึง ────────────────────────────── */}
      {(upcoming.length > 0 || pendingCount > 0) && (
        <Section
          title="การจองของคุณ"
          className="mb-6"
          action={
            <Link href="/my" className="text-sm font-semibold text-[var(--faculty)]">
              ดูทั้งหมด →
            </Link>
          }
        >
          {pendingCount > 0 && (
            <Card className="mb-2 flex items-center gap-3 p-4">
              <span className="text-2xl" aria-hidden>⏳</span>
              <p className="text-sm text-[var(--ink)]">
                มี <span className="font-bold">{pendingCount}</span> รายการรอแอดมินอนุมัติ
              </p>
            </Card>
          )}
          <div className="space-y-2">
            {upcoming.map((b) => (
              <Card key={b.id} className="flex items-center gap-3 p-4">
                <IconTile name={BOOKING_TYPE_ICON[b.bookingType]} size={18} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--ink)]">{b.itemName}</p>
                  <p className="truncate text-xs text-[var(--muted-ink)]">{fmtRange(b.startAt, b.endAt)}</p>
                </div>
                <Badge className={BOOKING_STATUS[b.status].cls}>{fmtRelative(b.startAt)}</Badge>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* ── ฟีด ────────────────────────────────────────────── */}
      <Section title="กิจกรรมล่าสุด">
        {loading ? (
          <Spinner />
        ) : error ? (
          <EmptyState icon="warning" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
        ) : feeds.length === 0 ? (
          <EmptyState icon="feed" text="ยังไม่มีกิจกรรมในขณะนี้" />
        ) : (
          <AnimatedList
            gap="0.75rem"
            items={feeds.slice(0, 30).map((f) => {
              const liked = !!user && f.likedBy?.includes(user.uid);
              return (
                <Card key={f.id} className="p-4">
                  <p className="text-sm leading-relaxed text-[var(--ink)]">{f.message}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted-ink)]">
                    <span>{fmtRelative(f.createdAt)}</span>
                    <div className="flex items-center gap-2">
                      {f.bookingStatus && (
                        <span className={`rounded-full px-2 py-0.5 ${BOOKING_STATUS[f.bookingStatus].cls}`}>
                          {BOOKING_STATUS[f.bookingStatus].label}
                        </span>
                      )}
                      <button
                        onClick={() => toggleLike(f, !!liked)}
                        aria-label={liked ? "เลิกถูกใจ" : "ถูกใจ"}
                        className="press tap flex items-center gap-1 rounded-full px-2 transition hover:bg-black/5"
                      >
                        <Icon name="like" size={16} className={liked ? "fill-[var(--faculty)] text-[var(--faculty)]" : ""} />
                        {f.likeCount ?? 0}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          />
        )}
      </Section>

      {settings.galleryUrl && (
        <a
          href={settings.galleryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="press mt-6 block rounded-3xl bg-[var(--ink)] p-5 text-center text-white"
        >
          <p className="t-heading flex items-center justify-center gap-2"><Icon name="gallery" size={20} /> อัลบั้มภาพกิจกรรม</p>
          <p className="mt-0.5 text-sm text-white/65">ดูผลงานที่ผ่านมาทั้งหมด →</p>
        </a>
      )}
    </div>
  );
}
