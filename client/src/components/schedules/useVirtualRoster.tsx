import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type RowId = string | number;

/** Pure range calculation kept independent of the DOM for variable-height rows. */
export function calculateVirtualRosterRange(
  heights: readonly number[],
  viewportTop: number,
  viewportBottom: number,
  overscan = 3,
) {
  const offsets = [0];
  for (const height of heights) offsets.push(offsets[offsets.length - 1] + Math.max(1, height));
  const count = heights.length;
  const total = offsets[count];
  if (!count) return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };
  const top = Math.max(0, Math.min(viewportTop, total - 1));
  const bottom = Math.max(top + 1, viewportBottom);
  let first = 0;
  while (first < count - 1 && offsets[first + 1] <= top) first++;
  let last = first + 1;
  while (last < count && offsets[last] < bottom) last++;
  const startIndex = Math.max(0, first - overscan);
  const endIndex = Math.min(count, last + overscan);
  return { startIndex, endIndex, paddingTop: offsets[startIndex], paddingBottom: total - offsets[endIndex] };
}

const viewportStyle: CSSProperties = {
  maxHeight: "65vh",
  overflowY: "auto",
  position: "relative",
  overflowAnchor: "none",
};

/** Virtualizes native table rows; the caller retains the table, header and spacer markup. */
export function useVirtualRoster({
  rowIds,
  resetKey,
  estimateHeight = 220,
  overscan = 3,
}: {
  rowIds: readonly RowId[];
  resetKey: string;
  estimateHeight?: number;
  overscan?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const rowsRef = useRef(rowIds);
  rowsRef.current = rowIds;
  const rowSignature = JSON.stringify(rowIds);
  const estimateRef = useRef(estimateHeight);
  estimateRef.current = estimateHeight;
  const heights = useRef(new Map<RowId, number>());
  const nodes = useRef(new Map<RowId, HTMLTableRowElement>());
  const nodeIds = useRef(new WeakMap<Element, RowId>());
  const observerRef = useRef<ResizeObserver | null>(null);
  const frameRef = useRef<number | null>(null);
  const viewportRef = useRef({ top: 0, bottom: 650 });
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const scroller = scrollRef.current;
      const header = headerRef.current;
      const table = header?.closest("table");
      if (scroller && table) {
        // The table itself scrolls normally, while its header stays pinned over the first rows.
        const tableTop = table.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop + scroller.scrollTop;
        const headerHeight = header?.getBoundingClientRect().height ?? 0;
        const bodyTop = tableTop + headerHeight;
        const top = Math.max(0, scroller.scrollTop + headerHeight - bodyTop);
        viewportRef.current = { top, bottom: Math.max(top + 1, scroller.scrollTop + scroller.clientHeight - bodyTop) };
      }
      setRevision(value => value + 1);
    });
  }, []);

  const recordHeight = useCallback((id: RowId, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const previous = heights.current.get(id) ?? estimateRef.current;
    if (heights.current.has(id) && Math.abs(previous - height) < 1) return;
    // Hold the visible rows steady when an overscan row above them receives its actual height.
    let rowEnd = 0;
    for (const rowId of rowsRef.current) {
      rowEnd += heights.current.get(rowId) ?? estimateRef.current;
      if (rowId === id) break;
    }
    const delta = height - previous;
    if (scrollRef.current && rowEnd <= viewportRef.current.top && delta) {
      scrollRef.current.scrollTop += delta;
      viewportRef.current.top += delta;
      viewportRef.current.bottom += delta;
    }
    heights.current.set(id, height);
    refresh();
  }, [refresh]);

  const measureRow = useCallback((id: RowId, node: HTMLTableRowElement | null) => {
    const previous = nodes.current.get(id);
    if (previous === node) return;
    if (previous) {
      observerRef.current?.unobserve(previous);
      nodes.current.delete(id);
    }
    if (node) {
      nodes.current.set(id, node);
      nodeIds.current.set(node, id);
      observerRef.current?.observe(node);
      recordHeight(id, node.getBoundingClientRect().height);
    }
  }, [recordHeight]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const header = headerRef.current;
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          const id = nodeIds.current.get(entry.target);
          if (id !== undefined && nodes.current.get(id) === entry.target) recordHeight(id, entry.target.getBoundingClientRect().height);
          else refresh();
        }
      });
      observerRef.current = observer;
      if (scroller) observer.observe(scroller);
      if (header) observer.observe(header);
      nodes.current.forEach(node => observer.observe(node));
    }
    scroller?.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh, { passive: true });
    refresh();
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      scroller?.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [recordHeight, refresh, rowSignature]);

  useLayoutEffect(() => {
    heights.current.clear();
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    viewportRef.current = { top: 0, bottom: scrollRef.current?.clientHeight ?? 650 };
    nodes.current.forEach((node, id) => recordHeight(id, node.getBoundingClientRect().height));
    refresh();
  }, [resetKey, recordHeight, refresh]);

  const range = useMemo(() => calculateVirtualRosterRange(
    rowsRef.current.map(id => heights.current.get(id) ?? estimateHeight),
    viewportRef.current.top,
    viewportRef.current.bottom,
    overscan,
  ), [rowSignature, revision, estimateHeight, overscan]);

  return { scrollRef, headerRef, measureRow, viewportStyle, ...range };
}
