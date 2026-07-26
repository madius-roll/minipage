import { useEffect, useRef, useState } from 'react';
import Header from '../components/layout/Header';
import ToolPanel, { DEFAULT_DRAW_FORM, getAllowedDrawModes, supportsRectShape, type DrawFormState, type DrawMode } from '../components/layout/ToolPanel';
import LayerPanel from '../components/layout/LayerPanel';
import PropertyPanel from '../components/layout/PropertyPanel';
import CadCanvas, { type CadCanvasHandle } from '../components/canvas/CadCanvas';
import LawGuideModal from '../components/guide/LawGuideModal';
import MobileSheetHandle from '../components/layout/MobileSheetHandle';
import MobileLayerStrip from '../components/layout/MobileLayerStrip';
import { dummyLayers, dummyShapes } from '../data/dummyDrawing';
import { ALL_LAYERS_ID, LAYER_COLOR_PALETTE, MAX_LAYERS } from '../data/layerMeta';
import type { Layer, LayerCategory, LineShape, Point, Shape } from '../types/cad';
import { distanceMm, genId, lengthAndAngleBetween, pointFromPolar, translateShape } from '../utils/geometry';
import { exportDrawingAsPdf } from '../utils/exportPdf';
import './EditorPage.css';

const ORIGIN: Point = { x: 0, y: 0 };
const PASTE_OFFSET = 300;

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export default function EditorPage() {
  const [layers, setLayers] = useState<Layer[]>(dummyLayers);
  const [shapes, setShapes] = useState<Shape[]>(dummyShapes);
  const [drawMode, setDrawMode] = useState<DrawMode>('line');
  const [drawForm, setDrawForm] = useState<DrawFormState>(DEFAULT_DRAW_FORM);
  const [activeLayerId, setActiveLayerId] = useState<string>(dummyLayers[0].id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingPoint, setPendingPoint] = useState<Point>(ORIGIN);
  /** 마우스로 직접 그리기 무장 상태 — CAD처럼 그리기 모드에서는 기본으로 켜져 있다 */
  const [drawArmed, setDrawArmed] = useState(true);
  /** 무장 상태에서 다음 클릭이 시작점을 찍는 차례인지, 끝점을 찍어 도형을 완성하는 차례인지 */
  const [drawPhase, setDrawPhase] = useState<'start' | 'end'>('start');
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [clipboard, setClipboard] = useState<Shape[]>([]);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [history, setHistory] = useState<Shape[][]>([]);
  const canvasRef = useRef<CadCanvasHandle>(null);

  /** 도형을 바꾸는 동작 직전에 호출해 실행취소용 스냅샷을 쌓는다 (연속 드래그는 시작 시점에 한 번만) */
  const pushHistory = () => {
    setHistory((prev) => [...prev, shapes]);
  };

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
    // "전체 레이어"에서는 그리기를 할 수 없다 — 전체 지우기 등 관리 동작만 가능
    if (id === ALL_LAYERS_ID) {
      setDrawArmed(false);
    } else {
      const layer = layers.find((l) => l.id === id);
      const allowed = getAllowedDrawModes(layer?.category);
      const nextMode = allowed.includes(drawMode) ? drawMode : allowed[0];
      if (nextMode !== drawMode) setDrawMode(nextMode);
      setDrawArmed(nextMode !== 'text');
      // 다른 레이어로 바꾸면 그 레이어에 속하지 않은 선택은 해제한다
      setSelectedIds((prev) => prev.filter((sid) => shapes.find((s) => s.id === sid)?.layer === id));
    }
  };

  const handleModeChange = (nextMode: DrawMode) => {
    setDrawMode(nextMode);
    setDrawArmed(nextMode !== 'text' && activeLayerId !== ALL_LAYERS_ID);
    setDrawPhase('start');
  };

  const handleToggleDrawArmed = () => {
    if (activeLayerId === ALL_LAYERS_ID) return;
    setDrawArmed((prev) => {
      const next = !prev;
      if (next) setDrawPhase('start');
      return next;
    });
  };

  const toggleLayerVisible = (id: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const renameLayer = (id: string, name: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
  };

  const addLayer = (name: string, category: LayerCategory) => {
    if (layers.length >= MAX_LAYERS) return;
    const color = LAYER_COLOR_PALETTE[layers.length % LAYER_COLOR_PALETTE.length];
    const newLayer: Layer = { id: genId('layer'), name, category, color, visible: true };
    setLayers((prev) => [...prev, newLayer]);
  };

  const deleteLayer = (id: string) => {
    if (layers.length <= 1) {
      window.alert('레이어가 최소 1개는 있어야 해요.');
      return;
    }
    const layer = layers.find((l) => l.id === id);
    const affected = shapes.filter((s) => s.layer === id).length;
    const message = affected > 0
      ? `"${layer?.name}" 레이어를 삭제하면 이 레이어의 도형 ${affected}개도 함께 삭제됩니다. 삭제할까요?`
      : `"${layer?.name}" 레이어를 삭제할까요?`;
    if (!window.confirm(message)) return;

    if (affected > 0) pushHistory();
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

  const handleAddLine = (lengthMm: number, angleDeg: number, thicknessMm?: number) => {
    pushHistory();
    const start = pendingPoint;
    const end = pointFromPolar(start, lengthMm, angleDeg);
    const id = genId('line');
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'line', start, end, lengthMm, angleDeg, thicknessMm }]);
    setPendingPoint(end);
    setSelectedIds([id]);
  };

  const handleAddCircle = (radiusMm: number) => {
    pushHistory();
    const id = genId('circle');
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'circle', center: pendingPoint, radiusMm }]);
    setSelectedIds([id]);
  };

  /** 사각형은 좌상단 꼭짓점(pendingPoint)에서 시작해 오른쪽·아래쪽으로 뻗어나간다 — center 파라미터를 넘기면(마우스 두 번 클릭) 대신 그 중심을 쓴다 */
  const handleAddRect = (widthMm: number, heightMm: number, center?: Point) => {
    pushHistory();
    const id = genId('rect');
    const resolvedCenter = center ?? { x: pendingPoint.x + widthMm / 2, y: pendingPoint.y + heightMm / 2 };
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'rect', center: resolvedCenter, widthMm, heightMm }]);
    setSelectedIds([id]);
  };

  const handleAddSprinklerHead = (radiusMm: number) => {
    pushHistory();
    const id = genId('circle');
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'circle', center: pendingPoint, radiusMm, sprinklerHead: true }]);
    setSelectedIds([id]);
  };

  /** 캔버스 클릭으로 시작점/중심점을 정할 때 호출 — 무장 상태라면 다음 클릭은 끝점을 찍는 차례로 넘어간다 */
  const handleCanvasClick = (point: Point) => {
    setPendingPoint(point);
    if (drawArmed) setDrawPhase('end');
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
        handleAddLine(lengthMm, angleDeg, isBeam && Number.isFinite(thickness) && thickness > 0 ? thickness : undefined);
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

  const handleDragStart = () => {
    pushHistory();
  };

  const handleResetPending = () => {
    setPendingPoint(ORIGIN);
    setDrawPhase('start');
    canvasRef.current?.centerOnOrigin();
  };

  const handleExportPdf = async () => {
    const svg = canvasRef.current?.getSvgElement();
    if (!svg || shapes.length === 0 || exportingPdf) return;
    setExportingPdf(true);
    try {
      const dateStamp = new Date().toISOString().slice(0, 10);
      await exportDrawingAsPdf(svg, shapes, `도면_${dateStamp}.pdf`);
    } catch (err) {
      window.alert('PDF 저장에 실패했어요. 다시 시도해 주세요.');
      console.error(err);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setShapes(previous);
    setHistory((prev) => prev.slice(0, -1));
    setSelectedIds([]);
  };

  const handleClearAll = () => {
    if (shapes.length === 0) return;
    if (!window.confirm('캔버스의 모든 도형을 삭제합니다. 되돌릴 수 없어요. 계속할까요?')) return;
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

  const handleTrimLine = (removedId: string, kept: LineShape[]) => {
    pushHistory();
    setShapes((prev) => [...prev.filter((s) => s.id !== removedId), ...kept]);
    setSelectedIds([]);
  };

  const handleUpdateLine = (id: string, lengthMm: number, angleDeg: number, thicknessMm?: number) => {
    pushHistory();
    setShapes((prev) => prev.map((s) => {
      if (s.id !== id || s.kind !== 'line') return s;
      const end = pointFromPolar(s.start, lengthMm, angleDeg);
      return { ...s, lengthMm, angleDeg, end, thicknessMm: thicknessMm !== undefined ? thicknessMm : s.thicknessMm };
    }));
  };

  const handleUpdateCircle = (id: string, radiusMm: number) => {
    pushHistory();
    setShapes((prev) => prev.map((s) => (s.id === id && s.kind === 'circle' ? { ...s, radiusMm } : s)));
  };

  const handleUpdateRect = (id: string, widthMm: number, heightMm: number) => {
    pushHistory();
    setShapes((prev) => prev.map((s) => (s.id === id && s.kind === 'rect' ? { ...s, widthMm, heightMm } : s)));
  };

  const handleUpdateText = (id: string, text: string) => {
    pushHistory();
    setShapes((prev) => prev.map((s) => (s.id === id && s.kind === 'text' ? { ...s, text } : s)));
  };

  const handleCopySelected = () => {
    const selected = shapes.filter((s) => selectedIds.includes(s.id));
    if (selected.length === 0) return;
    setClipboard(selected);
  };

  const handlePasteShape = () => {
    if (clipboard.length === 0) return;
    pushHistory();
    const pasted = clipboard.map((shape) => {
      const layerStillExists = layers.some((l) => l.id === shape.layer);
      return { ...translateShape(shape, PASTE_OFFSET, PASTE_OFFSET), id: genId(shape.kind), layer: layerStillExists ? shape.layer : activeLayerId };
    });
    setShapes((prev) => [...prev, ...pasted]);
    setSelectedIds(pasted.map((s) => s.id));
  };

  // 키보드 단축키: Delete=삭제, Ctrl+C=복사, Ctrl+V=붙여넣기 (입력창 포커스 중엔 무시)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || guideOpen) return;

      if (e.key === 'Escape' && drawArmed) {
        e.preventDefault();
        // 끝점을 찍는 중이었다면 진행 중인 도형만 취소하고, 이미 시작점 차례라면 마우스 그리기 자체를 끈다
        if (drawPhase === 'end') {
          setDrawPhase('start');
        } else {
          setDrawArmed(false);
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'c' && selectedIds.length > 0) {
          handleCopySelected();
        } else if (e.key.toLowerCase() === 'v') {
          handlePasteShape();
        } else if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, shapes, clipboard, guideOpen, layers, activeLayerId, drawArmed, drawPhase]);

  const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const activeLayerLabel = activeLayerId === ALL_LAYERS_ID ? '전체 레이어' : (activeLayer?.name ?? '');
  const activeLayerColor = activeLayerId === ALL_LAYERS_ID ? 'var(--sub)' : (activeLayer?.color ?? 'var(--sub)');
  /** 마우스로 그리기 미리보기에 쓸 도형 종류 — 도형그리기 모드에서 벽체/기둥 레이어의 사각형을 고른 경우만 rect, 나머지(SP헤드반경 포함)는 circle */
  const drawPreviewKind: 'line' | 'circle' | 'rect' =
    drawMode === 'line' ? 'line' : drawMode === 'circle' && supportsRectShape(activeLayer?.category) && drawForm.columnShape === 'rect' ? 'rect' : 'circle';

  return (
    <div className="app-shell" data-mobile-sheet={mobileSheetOpen ? 'open' : 'closed'}>
      <Header onOpenGuide={() => setGuideOpen(true)} onExportPdf={handleExportPdf} exportingPdf={exportingPdf} />

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
            drawArmed={drawArmed}
            onToggleDrawArmed={handleToggleDrawArmed}
            drawPhase={drawPhase}
            drawForm={drawForm}
            onDrawFormChange={updateDrawForm}
            onAddLine={handleAddLine}
            onAddCircle={handleAddCircle}
            onAddRect={handleAddRect}
            onAddSprinklerHead={handleAddSprinklerHead}
            onAddText={handleAddText}
            onResetPending={handleResetPending}
            onUndo={handleUndo}
            canUndo={history.length > 0}
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
        </aside>

        <main className="editor-canvas-area">
          <CadCanvas
            ref={canvasRef}
            shapes={shapes}
            layers={layers}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            pendingPoint={pendingPoint}
            mode={drawMode}
            onCanvasClick={handleCanvasClick}
            onMoveShapes={handleMoveShapes}
            onDragStart={handleDragStart}
            onUndo={handleUndo}
            canUndo={history.length > 0}
            activeLayerId={activeLayerId}
            onDeleteSelected={handleDeleteSelected}
            onResetPending={handleResetPending}
            onTrimLine={handleTrimLine}
            drawArmed={drawArmed}
            drawPhase={drawPhase}
            onFinishDraw={handleFinishDraw}
            drawPreviewKind={drawPreviewKind}
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
    </div>
  );
}
