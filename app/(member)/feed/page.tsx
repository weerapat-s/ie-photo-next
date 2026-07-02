"use client";
// app/(member)/feed/page.tsx — ฟีดกิจกรรม + กดไลก์
import { collection, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove, increment } from "firebase/firestore";
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

  async function toggleLike(id: string, liked: boolean) {
    if (!user) return;
    await updateDoc(doc(db, "feeds", id), {
      likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      likeCount: increment(liked ? -1 : 1),
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
                <p className="text-sm">{f.message}</p>
                {f.formImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.formImageUrl} alt="" className="mt-2 max-h-60 w-full rounded-lg object-cover" />
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                  <span>{fmtDateTime(f.createdAt)}</span>
                  <div className="flex items-center gap-2">
                    {f.bookingStatus && (
                      <span className={`rounded-full px-2 py-0.5 ${BOOKING_STATUS[f.bookingStatus].cls}`}>
                        {BOOKING_STATUS[f.bookingStatus].label}
                      </span>
                    )}
                    <button onClick={() => toggleLike(f.id, liked)} className="flex items-center gap-1">
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
