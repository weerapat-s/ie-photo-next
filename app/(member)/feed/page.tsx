"use client";
// app/(member)/feed/page.tsx — ฟีดกิจกรรม + กดไลก์
import { useState } from "react";
import { collection, query, orderBy, doc, runTransaction } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { useCollection } from "@/lib/hooks";
import { PageHeader, Card, Spinner, EmptyState } from "@/components/ui";
import { fmtDateTime, BOOKING_STATUS } from "@/lib/format";
import type { FeedDoc } from "@/lib/types";

export default function FeedPage() {
  const { user, profile } = useAuth();
  const [likingId, setLikingId] = useState<string | null>(null);
  const [likeError, setLikeError] = useState("");
  const { data: feeds, loading, error } = useCollection<FeedDoc>(
    () => query(collection(db, "feeds"), orderBy("createdAt", "desc")),
    []
  );

  async function toggleLike(feedId: string) {
    if (!user || likingId) return;
    setLikingId(feedId);
    setLikeError("");

    try {
      await runTransaction(db, async (transaction) => {
        const feedRef = doc(db, "feeds", feedId);
        const snapshot = await transaction.get(feedRef);
        if (!snapshot.exists()) throw new Error("FEED_NOT_FOUND");

        const current = snapshot.data() as FeedDoc;
        const likedBy = Array.isArray(current.likedBy) ? current.likedBy : [];
        const currentlyLiked = likedBy.includes(user.uid);
        const nextLikedBy = currentlyLiked
          ? likedBy.filter((uid) => uid !== user.uid)
          : [...likedBy, user.uid];
        const currentCount = Number.isFinite(current.likeCount) ? current.likeCount : likedBy.length;

        transaction.update(feedRef, {
          likedBy: nextLikedBy,
          likeCount: currentCount + (currentlyLiked ? -1 : 1),
        });
      });
    } catch (transactionError) {
      console.error("feed like failed:", transactionError);
      setLikeError("บันทึกการกดถูกใจไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLikingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="ภาพรวมวันนี้"
        subtitle={profile?.firstName ? `สวัสดี ${profile.firstName} 👋` : "อัปเดตการใช้งานในชุมนุม"}
      />

      <section aria-label="ทางลัดการจอง" className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/borrow"
          className="glass-card animate-in rounded-3xl p-5 outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <p className="text-sm font-semibold text-foreground">📷 ยืมอุปกรณ์</p>
          <p className="mt-1 text-sm text-muted-foreground">เลือกอุปกรณ์ แนบเอกสาร และส่งคำขอได้ในที่เดียว</p>
        </Link>
        <Link
          href="/studio"
          className="glass-card animate-in rounded-3xl p-5 outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <p className="text-sm font-semibold text-foreground">🎬 จองสตูดิโอ</p>
          <p className="mt-1 text-sm text-muted-foreground">ดูห้องว่างและส่งคำขอจองตามช่วงเวลาที่ต้องการ</p>
        </Link>
      </section>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">กิจกรรมล่าสุด</h2>
        <Link href="/calendar" className="text-sm font-medium text-primary hover:underline">
          ดูปฏิทิน
        </Link>
      </div>

      {likeError && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          ⚠️ {likeError}
        </p>
      )}

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
                <p className="text-sm text-foreground">{f.message}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{fmtDateTime(f.createdAt)}</span>
                  <div className="flex items-center gap-2">
                    {f.bookingStatus && (
                      <span className={`rounded-full px-2 py-0.5 ${BOOKING_STATUS[f.bookingStatus].cls}`}>
                        {BOOKING_STATUS[f.bookingStatus].label}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleLike(f.id)}
                      disabled={likingId === f.id}
                      aria-pressed={liked}
                      className="flex min-h-9 items-center gap-1 rounded-full px-2 transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
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
