import { useEffect, useState } from 'react';
import type { Layer, Point, Shape } from '../types/cad';
import { dummyLayers, dummyShapes } from '../data/dummyDrawing';
import { loadSavedDrawing, saveDrawing } from '../utils/storage';

/** 실행취소·다시실행용 스냅샷 — 도형뿐 아니라 레이어 구성과 시작점까지 함께 되돌려야 레이어 삭제·병합도 온전히 복구된다 */
interface HistoryEntry {
  name: string;
  /** 새 도면·파일 불러오기처럼 도면을 통째로 바꾼 지점 — 이 지점을 넘나들 때만 도면 이름도 함께 되돌린다 (평소의 이름 변경은 실행취소 대상이 아니다) */
  replaced: boolean;
  shapes: Shape[];
  layers: Layer[];
  pendingPoint: Point;
}

const ORIGIN: Point = { x: 0, y: 0 };
const MAX_HISTORY = 100;
const AUTOSAVE_DELAY_MS = 400;
const SAMPLE_DRAWING_NAME = '샘플 도면';

/**
 * 도면 한 장의 상태(이름·레이어·도형·시작점)와 실행취소/다시실행, 브라우저 자동 저장을 맡는다.
 * 저장된 도면이 있으면 그것으로, 없으면 샘플 도면으로 시작한다.
 */
export function useDrawing() {
  const [initial] = useState(loadSavedDrawing);
  const [name, setName] = useState(initial?.name ?? SAMPLE_DRAWING_NAME);
  const [layers, setLayers] = useState<Layer[]>(initial?.layers ?? dummyLayers);
  const [shapes, setShapes] = useState<Shape[]>(initial?.shapes ?? dummyShapes);
  const [pendingPoint, setPendingPoint] = useState<Point>(ORIGIN);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);

  // 입력이 잠깐 멈췄을 때 한 번만 저장한다 (드래그 중 매 프레임 저장하지 않도록)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaveFailed(!saveDrawing({ name, layers, shapes }));
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [name, layers, shapes]);

  /** 도형·레이어를 바꾸는 동작 직전에 호출해 실행취소용 스냅샷을 쌓는다 (연속 드래그는 시작 시점에 한 번만) */
  const pushEntry = (replaced: boolean) => {
    setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), { name, replaced, shapes, layers, pendingPoint }]);
    setFuture([]);
  };

  const pushHistory = () => pushEntry(false);

  const restore = (entry: HistoryEntry) => {
    if (entry.replaced) setName(entry.name);
    setShapes(entry.shapes);
    // 레이어 구성(추가·삭제·병합·이름)은 되돌리되, 표시/숨김은 실행취소 대상이 아니므로 지금 상태를 유지한다
    setLayers(entry.layers.map((l) => ({ ...l, visible: layers.find((cur) => cur.id === l.id)?.visible ?? l.visible })));
    setPendingPoint(entry.pendingPoint);
  };

  /** 되돌릴 것이 없으면 false */
  const undo = (): boolean => {
    const previous = history[history.length - 1];
    if (!previous) return false;
    setFuture((prev) => [...prev, { name, replaced: previous.replaced, shapes, layers, pendingPoint }]);
    setHistory((prev) => prev.slice(0, -1));
    restore(previous);
    return true;
  };

  /** 다시 실행할 것이 없으면 false */
  const redo = (): boolean => {
    const next = future[future.length - 1];
    if (!next) return false;
    setHistory((prev) => [...prev, { name, replaced: next.replaced, shapes, layers, pendingPoint }]);
    setFuture((prev) => prev.slice(0, -1));
    restore(next);
    return true;
  };

  /** 새 도면·파일 불러오기처럼 도면 전체를 갈아 끼운다 — 실수로 눌렀을 때를 대비해 실행취소로 되돌릴 수 있다 */
  const replaceDrawing = (next: { name: string; layers: Layer[]; shapes: Shape[] }) => {
    pushEntry(true);
    setName(next.name);
    setLayers(next.layers);
    setShapes(next.shapes);
    setPendingPoint(ORIGIN);
  };

  return {
    name,
    setName,
    layers,
    setLayers,
    shapes,
    setShapes,
    pendingPoint,
    setPendingPoint,
    pushHistory,
    undo,
    redo,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    replaceDrawing,
    saveFailed,
  };
}
