import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/layout/Header';
import DrawingMenu from '../components/layout/DrawingMenu';
import ToolPanel, { DEFAULT_DRAW_FORM, getAllowedDrawModes, isMouseDrawMode, supportsRectShape, type DrawFormState, type DrawMode } from '../components/layout/ToolPanel';
import LayerPanel from '../components/layout/LayerPanel';
import ReviewPanel from '../components/layout/ReviewPanel';
import PropertyPanel from '../components/layout/PropertyPanel';
import CadCanvas, { type CadCanvasHandle } from '../components/canvas/CadCanvas';
import LawGuideModal from '../components/guide/LawGuideModal';
import MobileSheetHandle from '../components/layout/MobileSheetHandle';
import MobileLayerStrip from '../components/layout/MobileLayerStrip';
import { dummyLayers } from '../data/dummyDrawing';
import { ALL_LAYERS_ID, LAYER_COLOR_PALETTE, MAX_LAYERS } from '../data/layerMeta';
import { useDialogs } from '../hooks/useDialogs';
import { useDrawing } from '../hooks/useDrawing';
import type { ArcShape, Layer, LayerCategory, LineShape, Point, Shape } from '../types/cad';
import { distanceMm, genId, lengthAndAngleBetween, pointFromPolar, translateShape } from '../utils/geometry';
import { exportDrawingAsPdf } from '../utils/exportPdf';
import { COLUMN_LABEL_PREFIX, nextNumberedLabel, numberedLabelPrefix, SPRINKLER_LABEL_PREFIX } from '../utils/labels';
import { computeReview } from '../utils/review';
import { DEFAULT_DRAWING_NAME, downloadDrawingFile, readDrawingFile } from '../utils/storage';
import './EditorPage.css';

const ORIGIN: Point = { x: 0, y: 0 };
const PASTE_OFFSET = 300;
/** 방향키 한 번에 선택 도형을 옮기는 거리(mm) — Shift를 누르면 크게 옮긴다 */
const NUDGE_MM = 10;
const NUDGE_LARGE_MM = 100;

const ARROW_DELTAS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export default function EditorPage() {
  const drawing = useDrawing();
  const { name, layers, setLayers, shapes, setShapes, pendingPoint, setPendingPoint, pushHistory } = drawing;
  const dialogs = useDialogs();
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const [drawForm, setDrawForm] = useState<DrawFormState>(DEFAULT_DRAW_FORM);
  const [activeLayerId, setActiveLayerId] = useState<string>(layers[0].id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** 마우스로 직접 그리기 무장 상태 — CAD처럼 그리기 모드(선/도형/SP헤드반경)를 고르면 기본으로 켜진다 */
  const [drawArmed, setDrawArmed] = useState(false);
  /** 무장 상태에서 다음 클릭이 시작점을 찍는 차례인지, 끝점을 찍어 도형을 완성하는 차례인지 */
  const [drawPhase, setDrawPhase] = useState<'start' | 'end'>('start');
  /** 직교 고정 — 켜면 마우스로 그리는 선이 0°/45°/90° 방향으로만 그려진다 (Shift를 누르고 있는 동안에도 같은 효과) */
  const [orthoLock, setOrthoLock] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [clipboard, setClipboard] = useState<Shape[]>([]);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [showUncovered, setShowUncovered] = useState(true);
  /** 도면을 통째로 갈아 끼울 때마다 올려서 캔버스를 새로 띄운다 (화면 맞춤·줌이 새 도면 기준으로 다시 잡힌다) */
  const [canvasKey, setCanvasKey] = useState(0);
  const canvasRef = useRef<CadCanvasHandle>(null);
  /** 실제로 캔버스 클릭이 그리기로 처리되는 상태 — 무장돼 있어도 선택/텍스트 모드나 "전체 레이어"에서는 그리지 않는다 */
  const armed = drawArmed && isMouseDrawMode(drawMode) && activeLayerId !== ALL_LAYERS_ID;

  const review = useMemo(() => computeReview(shapes, layers), [shapes, layers]);

  // 활성 레이어가 삭제/병합으로 사라지면 남은 첫 레이어로 대체 ("전체 레이어" 선택 상태는 예외)
  useEffect(() => {
    if (activeLayerId === ALL_LAYERS_ID) return;
    if (!layers.some((l) => l.id === activeLayerId) && layers.length > 0) {
      setActiveLayerId(layers[0].id);
      const allowed = getAllowedDrawModes(layers[0].category);
      setDrawMode((prev) => (allowed.includes(prev) ? prev : allowed[0]));
    }
  }, [layers, activeLayerId]);

  const updateDrawForm = (patch: Partial<DrawFormState>) => {
    setDrawForm((prev) => ({ ...prev, ...patch }));
  };

  const handleActiveLayerChange = (id: string) => {
    setActiveLayerId(id);
    setDrawPhase('start');
    // "전체 레이어"에서는 그리기를 할 수 없다 — 선택·이동·삭제 등 관리 동작만 가능
    if (id === ALL_LAYERS_ID) {
      setDrawMode('select');
      setDrawArmed(false);
    } else {
      const layer = layers.find((l) => l.id === id);
      const allowed = getAllowedDrawModes(layer?.category);
      const nextMode = allowed.includes(drawMode) ? drawMode : allowed[0];
      if (nextMode !== drawMode) setDrawMode(nextMode);
      setDrawArmed(isMouseDrawMode(nextMode));
      // 다른 레이어로 바꾸면 그 레이어에 속하지 않은 선택은 해제한다
      setSelectedIds((prev) => prev.filter((sid) => shapes.find((s) => s.id === sid)?.layer === id));
    }
  };

  const handleModeChange = (nextMode: DrawMode) => {
    setDrawMode(nextMode);
    setDrawArmed(isMouseDrawMode(nextMode) && activeLayerId !== ALL_LAYERS_ID);
    setDrawPhase('start');
  };

  const handleToggleDrawArmed = () => {
    if (activeLayerId === ALL_LAYERS_ID || !isMouseDrawMode(drawMode)) return;
    setDrawArmed((prev) => {
      const next = !prev;
      if (next) setDrawPhase('start');
      return next;
    });
  };

  const toggleLayerVisible = (id: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const renameLayer = (id: string, nextName: string) => {
    if (layers.find((l) => l.id === id)?.name === nextName) return;
    pushHistory();
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name: nextName } : l)));
  };

  const addLayer = (layerName: string, category: LayerCategory) => {
    if (layers.length >= MAX_LAYERS) return;
    // 이미 쓰이지 않는 색을 먼저 고른다 (레이어를 지웠다 다시 만들면 같은 색이 겹치지 않도록)
    const color = LAYER_COLOR_PALETTE.find((c) => !layers.some((l) => l.color === c)) ?? LAYER_COLOR_PALETTE[layers.length % LAYER_COLOR_PALETTE.length];
    const newLayer: Layer = { id: genId('layer'), name: layerName, category, color, visible: true };
    pushHistory();
    setLayers((prev) => [...prev, newLayer]);
  };

  const deleteLayer = async (id: string) => {
    if (layers.length <= 1) {
      dialogs.notify('레이어가 최소 1개는 있어야 해요.');
      return;
    }
    const layer = layers.find((l) => l.id === id);
    const affected = shapes.filter((s) => s.layer === id).length;
    const ok = await dialogs.confirm({
      title: '레이어 삭제',
      message: affected > 0
        ? `"${layer?.name}" 레이어와 이 레이어의 도형 ${affected}개를 함께 삭제할까요? 실행 취소로 되돌릴 수 있어요.`
        : `"${layer?.name}" 레이어를 삭제할까요?`,
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;

    pushHistory();
    setLayers((prev) => prev.filter((l) => l.id !== id));
    setShapes((prev) => prev.filter((s) => s.layer !== id));
    setMergeSelection((prev) => prev.filter((x) => x !== id));
    setSelectedIds((prev) => prev.filter((sid) => shapes.find((s) => s.id === sid)?.layer !== id));
  };

  const toggleMergeSelect = (id: string) => {
    setMergeSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const cancelMerge = () => {
    setMergeMode(false);
    setMergeSelection([]);
  };

  const confirmMerge = () => {
    if (mergeSelection.length !== 2) return;
    const [targetId, sourceId] = mergeSelection;
    pushHistory();
    setShapes((prev) => prev.map((s) => (s.layer === sourceId ? { ...s, layer: targetId } : s)));
    setLayers((prev) => prev.filter((l) => l.id !== sourceId));
    cancelMerge();
  };

  /** exactEnd를 넘기면(마우스로 끝점을 찍은 경우) 길이·각도로 다시 계산하지 않고 그 점을 그대로 끝점으로 쓴다 — 반올림된 길이·각도로 역산하면 스냅한 지점에서 1~2mm 어긋난다 */
  const handleAddLine = (lengthMm: number, angleDeg: number, thicknessMm?: number, exactEnd?: Point) => {
    pushHistory();
    const start = pendingPoint;
    const end = exactEnd ?? pointFromPolar(start, lengthMm, angleDeg);
    const id = genId('line');
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'line', start, end, lengthMm, angleDeg, thicknessMm }]);
    setPendingPoint(end);
    setSelectedIds([id]);
  };

  /** 기둥 레이어에 그리는 원·사각형에는 C1, C2 … 번호를 자동으로 붙인다 */
  const columnLabel = (): string | undefined => (
    layers.find((l) => l.id === activeLayerId)?.category === 'column' ? nextNumberedLabel(shapes, COLUMN_LABEL_PREFIX) : undefined
  );

  const handleAddCircle = (radiusMm: number) => {
    pushHistory();
    const id = genId('circle');
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'circle', center: pendingPoint, radiusMm, label: columnLabel() }]);
    setSelectedIds([id]);
  };

  /** 사각형은 좌상단 꼭짓점(pendingPoint)에서 시작해 오른쪽·아래쪽으로 뻗어나간다 — center 파라미터를 넘기면(마우스 두 번 클릭) 대신 그 중심을 쓴다 */
  const handleAddRect = (widthMm: number, heightMm: number, center?: Point) => {
    pushHistory();
    const id = genId('rect');
    const resolvedCenter = center ?? { x: pendingPoint.x + widthMm / 2, y: pendingPoint.y + heightMm / 2 };
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'rect', center: resolvedCenter, widthMm, heightMm, label: columnLabel() }]);
    setSelectedIds([id]);
  };

  const handleAddSprinklerHead = (radiusMm: number) => {
    pushHistory();
    const id = genId('circle');
    const label = nextNumberedLabel(shapes, SPRINKLER_LABEL_PREFIX);
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'circle', center: pendingPoint, radiusMm, sprinklerHead: true, label }]);
    setSelectedIds([id]);
  };

  /** 캔버스 클릭으로 시작점/중심점을 정할 때 호출 — 무장 상태라면 다음 클릭은 끝점을 찍는 차례로 넘어간다 */
  const handleCanvasClick = (point: Point) => {
    setPendingPoint(point);
    if (armed) setDrawPhase('end');
  };

  /** 마우스로 그리기 무장 상태에서 캔버스 클릭으로 확정될 때 호출 — pendingPoint(시작점/중심점)를 기준으로 실제 도형을 만든다 */
  const handleFinishDraw = (point: Point) => {
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    const isBeam = activeLayer?.category === 'beam';
    const canPickRectShape = supportsRectShape(activeLayer?.category);

    if (drawMode === 'line') {
      const { lengthMm, angleDeg } = lengthAndAngleBetween(pendingPoint, point);
      if (lengthMm > 0) {
        const thickness = parseFloat(drawForm.thicknessMm);
        handleAddLine(lengthMm, angleDeg, isBeam && Number.isFinite(thickness) && thickness > 0 ? thickness : undefined, point);
      }
    } else if (drawMode === 'circle') {
      if (canPickRectShape && drawForm.columnShape === 'rect') {
        // 첫 클릭(pendingPoint)과 두 번째 클릭(point)을 사각형의 마주보는 두 꼭짓점으로 삼는다 (중심점 기준 대칭 확장이 아님)
        const widthMm = Math.round(Math.abs(point.x - pendingPoint.x));
        const heightMm = Math.round(Math.abs(point.y - pendingPoint.y));
        if (widthMm > 0 && heightMm > 0) {
          const center = { x: (pendingPoint.x + point.x) / 2, y: (pendingPoint.y + point.y) / 2 };
          handleAddRect(widthMm, heightMm, center);
        }
      } else {
        const radiusMm = Math.round(distanceMm(pendingPoint, point));
        if (radiusMm > 0) handleAddCircle(radiusMm);
      }
    } else if (drawMode === 'sprinklerHead') {
      const radiusMm = Math.round(distanceMm(pendingPoint, point));
      if (radiusMm > 0) handleAddSprinklerHead(radiusMm);
    }
    // 무장 상태는 유지하고 다시 시작점을 찍는 차례로 돌아가 연속으로 그릴 수 있게 한다
    setDrawPhase('start');
  };

  const handleAddText = (text: string) => {
    pushHistory();
    const id = genId('text');
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'text', position: pendingPoint, text }]);
    setSelectedIds([id]);
  };

  const handleResetPending = () => {
    setPendingPoint(ORIGIN);
    setDrawPhase('start');
    canvasRef.current?.centerOnOrigin();
  };

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    if (shapes.length === 0) {
      dialogs.notify('저장할 도형이 없어요. 먼저 도면을 그려 주세요.');
      return;
    }
    setExportingPdf(true);
    try {
      await exportDrawingAsPdf({ name, shapes, layers, review, showUncovered });
    } catch (err) {
      dialogs.notify('PDF 저장에 실패했어요. 다시 시도해 주세요.');
      console.error(err);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleUndo = () => {
    if (!drawing.undo()) return;
    setSelectedIds([]);
    setDrawPhase('start');
  };

  const handleRedo = () => {
    if (!drawing.redo()) return;
    setSelectedIds([]);
    setDrawPhase('start');
  };

  const handleClearAll = async () => {
    if (shapes.length === 0) return;
    const ok = await dialogs.confirm({
      title: '전체 지우기',
      message: '캔버스의 모든 도형을 지울까요? 레이어는 그대로 남고, 실행 취소로 되돌릴 수 있어요.',
      confirmLabel: '전체 지우기',
      danger: true,
    });
    if (!ok) return;
    pushHistory();
    setShapes([]);
    setSelectedIds([]);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    pushHistory();
    setShapes((prev) => prev.filter((s) => !selectedIds.includes(s.id)));
    setSelectedIds([]);
  };

  const handleMoveShapes = (ids: string[], dx: number, dy: number) => {
    setShapes((prev) => prev.map((s) => (ids.includes(s.id) ? translateShape(s, dx, dy) : s)));
  };

  const handleTrimLine = (removedId: string, kept: (LineShape | ArcShape)[]) => {
    pushHistory();
    setShapes((prev) => [...prev.filter((s) => s.id !== removedId), ...kept]);
    setSelectedIds([]);
  };

  const handleUpdateLine = (id: string, lengthMm: number, angleDeg: number, thicknessMm?: number) => {
    const target = shapes.find((s) => s.id === id);
    if (!target || target.kind !== 'line') return;
    const nextThickness = thicknessMm !== undefined ? thicknessMm : target.thicknessMm;
    // 값이 그대로면(입력칸을 건드리지 않고 벗어난 경우 등) 실행취소 기록도 끝점 재계산도 하지 않는다
    if (target.lengthMm === lengthMm && target.angleDeg === angleDeg && target.thicknessMm === nextThickness) return;
    pushHistory();
    setShapes((prev) => prev.map((s) => {
      if (s.id !== id || s.kind !== 'line') return s;
      const end = pointFromPolar(s.start, lengthMm, angleDeg);
      return { ...s, lengthMm, angleDeg, end, thicknessMm: nextThickness };
    }));
  };

  const handleUpdateCircle = (id: string, radiusMm: number) => {
    const target = shapes.find((s) => s.id === id);
    if (!target || target.kind !== 'circle' || target.radiusMm === radiusMm) return;
    pushHistory();
    setShapes((prev) => prev.map((s) => (s.id === id && s.kind === 'circle' ? { ...s, radiusMm } : s)));
  };

  /** 그릴 때와 같은 기준(좌상단 꼭짓점 고정)으로 크기를 바꾼다 — 오른쪽·아래쪽으로만 늘어나거나 줄어든다 */
  const handleUpdateRect = (id: string, widthMm: number, heightMm: number) => {
    const target = shapes.find((s) => s.id === id);
    if (!target || target.kind !== 'rect' || (target.widthMm === widthMm && target.heightMm === heightMm)) return;
    pushHistory();
    setShapes((prev) => prev.map((s) => {
      if (s.id !== id || s.kind !== 'rect') return s;
      const center = { x: s.center.x + (widthMm - s.widthMm) / 2, y: s.center.y + (heightMm - s.heightMm) / 2 };
      return { ...s, center, widthMm, heightMm };
    }));
  };

  const handleUpdateText = (id: string, text: string) => {
    const target = shapes.find((s) => s.id === id);
    if (!target || target.kind !== 'text' || target.text === text) return;
    pushHistory();
    setShapes((prev) => prev.map((s) => (s.id === id && s.kind === 'text' ? { ...s, text } : s)));
  };

  /** 원·사각형의 라벨(SP-1, C1 등) 수정 — 빈 문자열이면 라벨을 지운다 */
  const handleUpdateLabel = (id: string, label: string) => {
    const target = shapes.find((s) => s.id === id);
    if (!target || (target.kind !== 'circle' && target.kind !== 'rect')) return;
    const next = label.trim() || undefined;
    if (target.label === next) return;
    pushHistory();
    setShapes((prev) => prev.map((s) => (s.id === id && (s.kind === 'circle' || s.kind === 'rect') ? { ...s, label: next } : s)));
  };

  const handleCopySelected = () => {
    const selected = shapes.filter((s) => selectedIds.includes(s.id));
    if (selected.length === 0) return;
    setClipboard(selected);
    dialogs.notify(`도형 ${selected.length}개를 복사했어요. 붙여넣기(Ctrl+V)로 복제할 수 있어요.`);
  };

  const handlePasteShape = () => {
    if (clipboard.length === 0) return;
    pushHistory();
    // 자동 번호 라벨(SP-1, C1 …)은 겹치지 않게 새 번호를 매긴다
    const numbered: Shape[] = [...shapes];
    const pasted = clipboard.map((shape) => {
      const layerStillExists = layers.some((l) => l.id === shape.layer);
      const copy: Shape = { ...translateShape(shape, PASTE_OFFSET, PASTE_OFFSET), id: genId(shape.kind), layer: layerStillExists ? shape.layer : activeLayerId };
      if (copy.kind === 'circle' || copy.kind === 'rect') {
        const prefix = numberedLabelPrefix(copy.label);
        if (prefix) copy.label = nextNumberedLabel(numbered, prefix);
      }
      numbered.push(copy);
      return copy;
    });
    setShapes((prev) => [...prev, ...pasted]);
    // 붙여넣은 도형이 지금 그리는 레이어 밖에 있으면 선택·이동이 안 되므로, 전체 레이어로 넘어가 바로 옮길 수 있게 한다
    if (activeLayerId !== ALL_LAYERS_ID && pasted.some((s) => s.layer !== activeLayerId)) {
      setActiveLayerId(ALL_LAYERS_ID);
    }
    setDrawMode('select');
    setDrawArmed(false);
    setDrawPhase('start');
    setSelectedIds(pasted.map((s) => s.id));
  };

  const handleNudgeSelected = (dx: number, dy: number, isRepeat: boolean) => {
    if (selectedIds.length === 0) return;
    // 키를 누르고 있는 동안 반복되는 이동은 처음 한 번만 실행취소 기록에 남긴다
    if (!isRepeat) pushHistory();
    handleMoveShapes(selectedIds, dx, dy);
  };

  /** 방호 검토 경고를 누르면 관련 헤드를 캔버스에서 선택해 보여준다 */
  const handleSelectReviewShapes = (ids: string[]) => {
    if (ids.length === 0) return;
    setActiveLayerId(ALL_LAYERS_ID);
    setDrawMode('select');
    setDrawArmed(false);
    setDrawPhase('start');
    setSelectedIds(ids);
    setMobileSheetOpen(false);
  };

  const resetEditorForNewDrawing = (nextLayers: Layer[]) => {
    setSelectedIds([]);
    setClipboard([]);
    setActiveLayerId(nextLayers[0].id);
    setDrawMode('select');
    setDrawArmed(false);
    setDrawPhase('start');
    cancelMerge();
    setCanvasKey((k) => k + 1);
  };

  const handleNewDrawing = async () => {
    const ok = await dialogs.confirm({
      title: '새 도면',
      message: '지금 도면을 비우고 새로 시작할까요? 필요하면 먼저 "파일로 저장"해 두세요.',
      confirmLabel: '새로 시작',
      danger: true,
    });
    if (!ok) return;
    const nextLayers = dummyLayers.map((l) => ({ ...l, visible: true }));
    drawing.replaceDrawing({ name: DEFAULT_DRAWING_NAME, layers: nextLayers, shapes: [] });
    resetEditorForNewDrawing(nextLayers);
  };

  const handleSaveFile = () => {
    downloadDrawingFile({ name, layers, shapes });
  };

  const handleLoadFile = async (file: File) => {
    const loaded = await readDrawingFile(file);
    if (!loaded) {
      dialogs.notify('도면 파일을 읽지 못했어요. 이 앱에서 저장한 파일인지 확인해 주세요.');
      return;
    }
    drawing.replaceDrawing(loaded);
    resetEditorForNewDrawing(loaded.layers);
    dialogs.notify(`"${loaded.name}" 도면을 불러왔어요.`);
  };

  // 키보드 단축키 (입력창 포커스 중이거나 모달이 떠 있으면 무시)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || guideOpen || dialogs.isConfirmOpen) return;

      if (e.key === 'Escape' && armed) {
        e.preventDefault();
        // 끝점을 찍는 중이었다면 진행 중인 도형만 취소하고, 이미 시작점 차례라면 그리기를 끝내고 선택 도구로 돌아간다
        if (drawPhase === 'end') {
          setDrawPhase('start');
        } else {
          handleModeChange('select');
        }
        return;
      }
      if (e.key === 'Escape' && selectedIds.length > 0) {
        setSelectedIds([]);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
      const arrow = ARROW_DELTAS[e.key];
      if (arrow && selectedIds.length > 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM;
        handleNudgeSelected(arrow.x * step, arrow.y * step, e.repeat);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'c' && selectedIds.length > 0) {
          handleCopySelected();
        } else if (key === 'v') {
          handlePasteShape();
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          handleRedo();
        } else if (key === 'z') {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // 핸들러들이 매 렌더마다 새로 만들어지므로 의존성 없이 항상 최신 것을 다시 건다
  });

  const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const activeLayerLabel = activeLayerId === ALL_LAYERS_ID ? '전체 레이어' : (activeLayer?.name ?? '');
  const activeLayerColor = activeLayerId === ALL_LAYERS_ID ? 'var(--sub)' : (activeLayer?.color ?? 'var(--sub)');
  /** 마우스로 그리기 미리보기에 쓸 도형 종류 — 도형그리기 모드에서 벽체/기둥 레이어의 사각형을 고른 경우만 rect, 나머지(SP헤드반경 포함)는 circle */
  const drawPreviewKind: 'line' | 'circle' | 'rect' =
    drawMode === 'line' ? 'line' : drawMode === 'circle' && supportsRectShape(activeLayer?.category) && drawForm.columnShape === 'rect' ? 'rect' : 'circle';

  return (
    <div className="app-shell" data-mobile-sheet={mobileSheetOpen ? 'open' : 'closed'}>
      <Header
        onOpenGuide={() => setGuideOpen(true)}
        onExportPdf={handleExportPdf}
        exportingPdf={exportingPdf}
        drawingMenu={(
          <DrawingMenu
            name={name}
            onRename={drawing.setName}
            onNewDrawing={handleNewDrawing}
            onSaveFile={handleSaveFile}
            onLoadFile={handleLoadFile}
            saveFailed={drawing.saveFailed}
          />
        )}
      />

      <MobileLayerStrip
        layers={layers}
        activeLayerId={activeLayerId}
        onSelectActiveLayer={handleActiveLayerChange}
      />

      <div className="app-body">
        <aside className="editor-sidebar">
          <ToolPanel
            layers={layers}
            activeLayerId={activeLayerId}
            onActiveLayerChange={handleActiveLayerChange}
            mode={drawMode}
            onModeChange={handleModeChange}
            pendingPoint={pendingPoint}
            drawArmed={armed}
            onToggleDrawArmed={handleToggleDrawArmed}
            drawPhase={drawPhase}
            orthoLock={orthoLock}
            onToggleOrthoLock={() => setOrthoLock((prev) => !prev)}
            drawForm={drawForm}
            onDrawFormChange={updateDrawForm}
            onAddLine={handleAddLine}
            onAddCircle={handleAddCircle}
            onAddRect={handleAddRect}
            onAddSprinklerHead={handleAddSprinklerHead}
            onAddText={handleAddText}
            onResetPending={handleResetPending}
            onUndo={handleUndo}
            canUndo={drawing.canUndo}
            onRedo={handleRedo}
            canRedo={drawing.canRedo}
            onClearAll={handleClearAll}
            canClearAll={shapes.length > 0}
          />
          <LayerPanel
            layers={layers}
            activeLayerId={activeLayerId}
            onSelectActiveLayer={handleActiveLayerChange}
            onToggleVisible={toggleLayerVisible}
            onRenameLayer={renameLayer}
            onDeleteLayer={deleteLayer}
            onAddLayer={addLayer}
            mergeMode={mergeMode}
            mergeSelection={mergeSelection}
            onEnterMergeMode={() => setMergeMode(true)}
            onCancelMerge={cancelMerge}
            onToggleMergeSelect={toggleMergeSelect}
            onConfirmMerge={confirmMerge}
          />
          <ReviewPanel
            review={review}
            showUncovered={showUncovered}
            onToggleUncovered={() => setShowUncovered((prev) => !prev)}
            onSelectShapes={handleSelectReviewShapes}
          />
        </aside>

        <main className="editor-canvas-area">
          <CadCanvas
            key={canvasKey}
            ref={canvasRef}
            shapes={shapes}
            layers={layers}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            pendingPoint={pendingPoint}
            mode={drawMode}
            onCanvasClick={handleCanvasClick}
            onMoveShapes={handleMoveShapes}
            onDragStart={pushHistory}
            onUndo={handleUndo}
            canUndo={drawing.canUndo}
            onRedo={handleRedo}
            canRedo={drawing.canRedo}
            activeLayerId={activeLayerId}
            onDeleteSelected={handleDeleteSelected}
            onResetPending={handleResetPending}
            onTrimLine={handleTrimLine}
            drawArmed={armed}
            drawPhase={drawPhase}
            onFinishDraw={handleFinishDraw}
            drawPreviewKind={drawPreviewKind}
            orthoLock={orthoLock}
            uncoveredRects={showUncovered ? review.uncoveredRects : []}
          />
        </main>
      </div>

      {selectedShapes.length > 0 && (
        <PropertyPanel
          selectedShapes={selectedShapes}
          onUpdateLine={handleUpdateLine}
          onUpdateCircle={handleUpdateCircle}
          onUpdateRect={handleUpdateRect}
          onUpdateText={handleUpdateText}
          onUpdateLabel={handleUpdateLabel}
          onDeleteSelected={handleDeleteSelected}
          onCopySelected={handleCopySelected}
          onPasteShape={handlePasteShape}
          hasClipboard={clipboard.length > 0}
        />
      )}

      <MobileSheetHandle
        layerName={activeLayerLabel}
        layerColor={activeLayerColor}
        mode={drawMode}
        onModeChange={handleModeChange}
        isDrawable={activeLayerId !== ALL_LAYERS_ID}
        layerCategory={activeLayer?.category}
        isBeam={activeLayer?.category === 'beam'}
        drawForm={drawForm}
        onDrawFormChange={updateDrawForm}
        onAddLine={handleAddLine}
        onAddCircle={handleAddCircle}
        onAddSprinklerHead={handleAddSprinklerHead}
        onAddText={handleAddText}
        selectedShape={selectedShapes.length === 1 ? selectedShapes[0] : null}
        onUpdateLine={handleUpdateLine}
        onUpdateCircle={handleUpdateCircle}
        onUpdateRect={handleUpdateRect}
        open={mobileSheetOpen}
        onToggle={() => setMobileSheetOpen((prev) => !prev)}
      />

      {guideOpen && <LawGuideModal onClose={() => setGuideOpen(false)} />}
      {dialogs.element}
    </div>
  );
}
