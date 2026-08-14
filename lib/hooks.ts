"use client";
// lib/hooks.ts — Firestore real-time hooks
import { useEffect, useState } from "react";
import { onSnapshot, type Query, type DocumentReference } from "firebase/firestore";
import type { WithId } from "./types";

function sameDependencies(left: unknown[] | null, right: unknown[]) {
  return left !== null && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

/**
 * subscribe collection แบบ realtime
 * @param makeQuery factory คืน Query (หรือ null เพื่อข้าม)
 * @param deps      dependency ที่ทำให้ query เปลี่ยน
 */
export function useCollection<T>(
  makeQuery: () => Query | null,
  deps: unknown[]
): { data: WithId<T>[]; loading: boolean; error: boolean } {
  // Constructing a Firestore query is pure. This lets the hook immediately
  // clear its derived result when the caller has no query (for example, before
  // auth finishes) without setting state from an effect.
  const hasQuery = makeQuery() !== null;
  const [state, setState] = useState<{
    deps: unknown[] | null;
    data: WithId<T>[];
    loading: boolean;
    error: boolean;
  }>({ deps: null, data: [], loading: true, error: false });

  useEffect(() => {
    const q = makeQuery();
    if (!q) return;
    const unsub = onSnapshot(
      q,
      (snap) => {
        setState({
          deps: [...deps],
          data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })),
          loading: false,
          error: false,
        });
      },
      (e) => {
        console.error("useCollection query failed:", e.message);
        setState({ deps: [...deps], data: [], loading: false, error: true });
      }
    );
    return unsub;
    // The caller supplies the dependency list that controls query creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const isCurrentQuery = sameDependencies(state.deps, deps);
  return {
    data: hasQuery && isCurrentQuery ? state.data : [],
    loading: hasQuery ? !isCurrentQuery || state.loading : false,
    error: hasQuery && isCurrentQuery && state.error,
  };
}

export function useDocument<T>(
  makeRef: () => DocumentReference | null,
  deps: unknown[]
): { data: WithId<T> | null; loading: boolean } {
  const hasRef = makeRef() !== null;
  const [state, setState] = useState<{
    deps: unknown[] | null;
    data: WithId<T> | null;
    loading: boolean;
  }>({ deps: null, data: null, loading: true });

  useEffect(() => {
    const ref = makeRef();
    if (!ref) return;
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setState({
          deps: [...deps],
          data: snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null,
          loading: false,
        });
      },
      () => setState({ deps: [...deps], data: null, loading: false })
    );
    return unsub;
    // The caller supplies the dependency list that controls reference creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const isCurrentRef = sameDependencies(state.deps, deps);
  return {
    data: hasRef && isCurrentRef ? state.data : null,
    loading: hasRef ? !isCurrentRef || state.loading : false,
  };
}

/** เวลา client ที่ refresh เป็นช่วง เพื่อไม่เรียก Date.now() ระหว่าง render */
export function useNow(refreshMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);

  return now;
}
