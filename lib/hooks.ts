"use client";
// lib/hooks.ts — Firestore real-time hooks
import { useEffect, useState } from "react";
import { onSnapshot, type Query, type DocumentReference } from "firebase/firestore";
import type { WithId } from "./types";

/**
 * subscribe collection แบบ realtime
 * @param makeQuery factory คืน Query (หรือ null เพื่อข้าม)
 * @param deps      dependency ที่ทำให้ query เปลี่ยน
 */
export function useCollection<T>(
  makeQuery: () => Query | null,
  deps: unknown[]
): { data: WithId<T>[]; loading: boolean; error: boolean } {
  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const q = makeQuery();
    if (!q) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })));
        setLoading(false);
        setError(false);
      },
      (e) => {
        console.error("useCollection query failed:", e.message);
        setError(true);
        setLoading(false);
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

export function useDocument<T>(
  makeRef: () => DocumentReference | null,
  deps: unknown[]
): { data: WithId<T> | null; loading: boolean } {
  const [data, setData] = useState<WithId<T> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = makeRef();
    if (!ref) {
      setData(null);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading };
}
