"use client";
// app/(member)/feed/page.tsx — ฟีดกิจกรรม + กดไลก์
import { collection, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Spinner, EmptyState } from "@/components/ui";
import { fmtDateTime, BOOKING_STATUS } from "@/lib/format";
import type { FeedDoc } from "@/lib/types";

export default function FeedPage() {
  const { user, profile } = useAuth();
  const { data: feeds, loading, error } = useCollection<FeedDoc>(
    () => query(collection(db, "feeds"), orderBy("createdAt", "desc")),
    []
  );

  async function toggleLike(f: FeedDoc & { id: string }, liked: boolean) {
    if (!user) return;
    const currentCount = f.likeCount ?? 0;
    const newCount = liked ? currentCount - 1 : currentCount + 1;
    await updateDoc(doc(db, "feeds", f.id), {
      likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      likeCount: newCount,
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="กิจกรรมล่าสุด"
        subtitle={profile?.firstName ? `สวัสดี ${profile.firstName} 👋` : "อัปเดตการใช้งานในชุมนุม"}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon="⚠️" text="โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า" />
      ) : feeds.length === 0 ? (
        <EmptyState icon="📰" text="ยังไม่มีกิจกรรมในขณะนี้" />
      ) : (
        <div className="space-y-3">
          {feeds.map((f) => {
            const liked = !!user && f.likedBy?.includes(user.uid);
            return (
              <Card key={f.id}>
                <p className="text-sm text-slate-200">{f.message}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>{fmtDateTime(f.createdAt)}</span>
                  <div className="flex items-center gap-2">
                    {f.bookingStatus && (
                      <span className={`rounded-full px-2 py-0.5 ${BOOKING_STATUS[f.bookingStatus].cls}`}>
                        {BOOKING_STATUS[f.bookingStatus].label}
                      </span>
                    )}
                    <button onClick={() => toggleLike(f, liked)} className="flex items-center gap-1 hover:text-slate-200 transition">
                      <span>{liked ? "❤️" : "🤍"}</span>
                      {f.likeCount ?? 0}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
