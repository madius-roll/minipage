import { useEffect, useRef, useState } from 'react';
import Header from '../components/layout/Header';
import ToolPanel, { DEFAULT_DRAW_FORM, type DrawFormState, type DrawMode } from '../components/layout/ToolPanel';
import LayerPanel from '../components/layout/LayerPanel';
import PropertyPanel from '../components/layout/PropertyPanel';
import CadCanvas, { type CadCanvasHandle } from '../components/canvas/CadCanvas';
import LawGuideModal from '../components/guide/LawGuideModal';
import MobileSheetHandle from '../components/layout/MobileSheetHandle';
import MobileLayerStrip from '../components/layout/MobileLayerStrip';
import { dummyLayers, dummyShapes } from '../data/dummyDrawing';
import { ALL_LAYERS_ID, LAYER_COLOR_PALETTE, MAX_LAYERS } from '../data/layerMeta';
import type { Layer, LayerCategory, Point, Shape } from '../types/cad';
import { genId, pointFromPolar, translateShape } from '../utils/geometry';
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
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
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
    }
  }, [layers, activeLayerId]);

  const updateDrawForm = (patch: Partial<DrawFormState>) => {
    setDrawForm((prev) => ({ ...prev, ...patch }));
  };

  const handleActiveLayerChange = (id: string) => {
    setActiveLayerId(id);
    // 다른 레이어로 바꾸면 그 레이어에 속하지 않은 선택은 해제한다 ("전체 레이어"에서는 모두 유지)
    if (id !== ALL_LAYERS_ID) {
      setSelectedIds((prev) => prev.filter((sid) => shapes.find((s) => s.id === sid)?.layer === id));
    }
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

  const handleAddRect = (widthMm: number, heightMm: number) => {
    pushHistory();
    const id = genId('rect');
    setShapes((prev) => [...prev, { id, layer: activeLayerId, kind: 'rect', center: pendingPoint, widthMm, heightMm }]);
    setSelectedIds([id]);
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
    canvasRef.current?.centerOnOrigin();
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
  }, [selectedIds, shapes, clipboard, guideOpen, layers, activeLayerId]);

  const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const activeLayerLabel = activeLayerId === ALL_LAYERS_ID ? '전체 레이어' : (activeLayer?.name ?? '');
  const activeLayerColor = activeLayerId === ALL_LAYERS_ID ? 'var(--sub)' : (activeLayer?.color ?? 'var(--sub)');

  return (
    <div className="app-shell" data-mobile-sheet={mobileSheetOpen ? 'open' : 'closed'}>
      <Header onOpenGuide={() => setGuideOpen(true)} />

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
            onModeChange={setDrawMode}
            pendingPoint={pendingPoint}
            drawForm={drawForm}
            onDrawFormChange={updateDrawForm}
            onAddLine={handleAddLine}
            onAddCircle={handleAddCircle}
            onAddRect={handleAddRect}
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
            onCanvasClick={setPendingPoint}
            onMoveShapes={handleMoveShapes}
            onDragStart={handleDragStart}
            onUndo={handleUndo}
            canUndo={history.length > 0}
            activeLayerId={activeLayerId}
            onDeleteSelected={handleDeleteSelected}
            onResetPending={handleResetPending}
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
        isDrawable={activeLayerId !== ALL_LAYERS_ID}
        isBeam={activeLayer?.category === 'beam'}
        drawForm={drawForm}
        onDrawFormChange={updateDrawForm}
        onAddLine={handleAddLine}
        onAddCircle={handleAddCircle}
        onAddText={handleAddText}
        open={mobileSheetOpen}
        onToggle={() => setMobileSheetOpen((prev) => !prev)}
      />

      {guideOpen && <LawGuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
