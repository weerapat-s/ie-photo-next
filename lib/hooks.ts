"use client";
// lib/hooks.ts — Firestore real-time hooks + helper ทั่วไป
/* eslint-disable react-hooks/set-state-in-effect --
   useCollection/useDocument เป็น subscription hook: ตอน query เปลี่ยนต้องล้างข้อมูลเดิม
   และตั้ง loading ทันทีในรอบเดียวกัน ไม่งั้นหน้าจะค้างข้อมูลของ query ก่อนหน้า */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { onSnapshot, type Query, type DocumentReference } from "firebase/firestore";
import type { WithId } from "./types";
import { subscribeDevMode, getDevMode } from "./dev-mode";

/**
 * subscribe collection แบบ realtime
 * @param makeQuery factory คืน Query (หรือ null เพื่อข้าม)
 * @param deps      dependency ที่ทำให้ query เปลี่ยน
 */
/** ชื่อ collection จาก Query — ใช้เขียน log ให้รู้ว่าอะไรพัง */
function describeQuery(q: Query): string {
  const path = (q as unknown as { _query?: { path?: { segments?: string[] } } })._query?.path?.segments;
  return Array.isArray(path) && path.length ? path.join("/") : "unknown";
}

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
    let gotData = false;
    const unsub = onSnapshot(
      q,
      (snap) => {
        gotData = true;
        setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })));
        setLoading(false);
        setError(false);
      },
      (e) => {
        // บอกให้ชัดว่า collection ไหนพัง — เดิมขึ้นแค่ข้อความรวม ไล่หาต้นตอไม่ได้
        console.error(`useCollection failed [${describeQuery(q)}]:`, e.code ?? "", e.message);
        // เคยโหลดสำเร็จมาแล้วก็เก็บข้อมูลเดิมไว้ ไม่ล้างหน้าจอ
        //
        // เกิดจริงตอน deploy firestore.rules ใหม่ระหว่างที่หน้าเปิดค้างอยู่:
        // listener เดิมถูกตัดแล้วโยน permission-denied ทั้งที่สิทธิ์ยังถูกต้อง
        // ถ้าตีเป็น error เต็มรูปแบบ ผู้ใช้จะเห็น "โหลดข้อมูลไม่สำเร็จ" ทั้งหน้า
        // ทั้งที่ข้อมูลยังอยู่ในมือครบ
        if (!gotData) setError(true);
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
        setData(snap.exists() ? { id: snap.id, ...(snap.data() as T) } : null);
        setLoading(false);
      },
      (e) => {
        console.error(`useDocument failed [${ref.path}]:`, e.code ?? "", e.message);
        setLoading(false);
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading };
}

/**
 * เวลาปัจจุบันแบบใช้ตอน render ได้
 * ปัดเป็นช่วง (bucket) เพื่อให้ค่าคงที่ระหว่างช่วง — คอมโพเนนต์ไม่ re-render รัว
 * และป้ายอย่าง "อีก 3 นาที" อัปเดตเองโดยไม่ต้องรีเฟรชหน้า
 * (เรียก Date.now() ตรง ๆ ตอน render ไม่ได้ — เป็นฟังก์ชันไม่บริสุทธิ์)
 */
export function useNow(bucketMs = 30_000): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = setInterval(onChange, bucketMs);
      return () => clearInterval(id);
    },
    [bucketMs]
  );
  const getSnapshot = useCallback(() => Math.floor(Date.now() / bucketMs) * bucketMs, [bucketMs]);
  // ฝั่ง server ยังไม่มีเวลาให้ใช้ — คืน 0 แล้วค่อยได้ค่าจริงตอน hydrate
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

/** อ่านค่าจาก browser API ที่ไม่เปลี่ยนระหว่าง session (เช่น รองรับ WebGL ไหม) */
const noopSubscribe = () => () => {};
export function useBrowserValue<T>(read: () => T, serverFallback: T): T {
  // read ต้องเป็นฟังก์ชันที่ identity คงที่ (ห่อด้วย useCallback ฝั่งผู้เรียก)
  return useSyncExternalStore(noopSubscribe, read, () => serverFallback);
}

/** อ่านค่า devMode แบบ realtime (subscribe การเปลี่ยนแปลง) */
export function useDevMode(): boolean {
  return useSyncExternalStore(
    (fn) => subscribeDevMode(fn),
    () => getDevMode(),
    () => false
  );
}
