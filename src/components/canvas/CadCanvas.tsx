import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Layer, Point, Shape } from '../../types/cad';
import {
  boundsIntersect,
  distanceToSegment,
  estimateTextBoxMm,
  findNearestVertex,
  formatMeters,
  getBounds,
  getShapeBounds,
  getShapeVertices,
  lerpPoint,
  nearestPointOnCircle,
  pointFromPolar,
  translateShape,
} from '../../utils/geometry';
import { ALL_LAYERS_ID } from '../../data/layerMeta';
import type { DrawMode } from '../layout/ToolPanel';
import { IconFit, IconUndo, IconZoomIn, IconZoomOut } from '../ui/Icon';
import './CadCanvas.css';

interface CadCanvasProps {
  shapes: Shape[];
  layers: Layer[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  pendingPoint: Point;
  mode: DrawMode;
  onCanvasClick: (point: Point) => void;
  onMoveShapes: (ids: string[], dx: number, dy: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  activeLayerId: string;
}

export interface CadCanvasHandle {
  /** 원점(0,0)이 화면 정중앙에 오도록 이동(줌 배율은 유지) */
  centerOnOrigin: () => void;
}

const GRID_MM = 500;
const DEFAULT_LINE_THICKNESS = 24;
const CENTER_DOT_RADIUS = 40;
const CLICK_TOLERANCE_PX = 10;
const SNAP_TOLERANCE_PX = 18;
/** 스냅 상태에서 떨어져 나갈 때는 더 작은 허용오차를 써서 더 빨리 분리되게 한다 */
const SNAP_RELEASE_TOLERANCE_PX = 6;
/** 선 길이 표기 라벨을 선분에서 얼마나 띄울지(mm) */
const LENGTH_LABEL_OFFSET_MM = 150;
/** 원 반지름 표기 라벨을 원 둘레에서 얼마나 더 띄울지(mm) */
const RADIUS_LABEL_MARGIN_MM = 220;
/** 선분 위 배치 가이드 점(양끝/중점/사분점) 반지름(mm) */
const GUIDE_DOT_RADIUS = 34;
/** 가이드 점을 정확히 겨냥해 클릭했을 때, 그 지점이 도형 몸체 위라도 선택보다 배치를 우선시키는 좁은 허용오차 */
const PLACEMENT_SNAP_PRIORITY_PX = 7;
const MARQUEE_THRESHOLD_PX = 4;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 8;
const WHEEL_ZOOM_STEP = 1.15;
const BUTTON_ZOOM_STEP = 1.25;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const pointDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointMidpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

interface PinchState {
  startDistPx: number;
  startMid: Point;
  startZoom: number;
  startPan: Point;
}

const CadCanvas = forwardRef<CadCanvasHandle, CadCanvasProps>(function CadCanvas(
  { shapes, layers, selectedIds, onSelect, pendingPoint, mode, onCanvasClick, onMoveShapes, onUndo, canUndo, activeLayerId },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ ids: string[]; lastMm: Point } | null>(null);
  const dragSnappedRef = useRef(false);
  const marqueeRef = useRef<{ startMm: Point; moved: boolean } | null>(null);
  const panRef = useRef<{ startClientX: number; startClientY: number; startPan: Point } | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);
  const [snapMarker, setSnapMarker] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const layerMap = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const visibleShapes = shapes.filter((s) => layerMap.get(s.layer)?.visible !== false);
  /** 클릭/드래그로 선택 가능한 도형 — "그릴 레이어"로 선택된 레이어의 도형만 (다른 레이어는 보이되 선택은 안 됨) */
  const selectableShapes = activeLayerId === ALL_LAYERS_ID ? visibleShapes : visibleShapes.filter((s) => s.layer === activeLayerId);

  const bounds = useMemo(() => getBounds([...shapes, { id: '_pending', layer: '_pending', kind: 'circle', center: pendingPoint, radiusMm: 400 }]), [shapes, pendingPoint]);
  const padding = 800;
  const { minX, minY, maxX, maxY } = bounds;
  const baseWidth = maxX - minX + padding * 2;
  const baseHeight = maxY - minY + padding * 2;
  const viewWidth = baseWidth / zoom;
  const viewHeight = baseHeight / zoom;
  const centerX = (minX + maxX) / 2 + pan.x;
  const centerY = (minY + maxY) / 2 + pan.y;
  const viewBox = `${centerX - viewWidth / 2} ${centerY - viewHeight / 2} ${viewWidth} ${viewHeight}`;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
    };
    svg.addEventListener('wheel', onWheelNative, { passive: false });
    return () => svg.removeEventListener('wheel', onWheelNative);
  }, []);

  useImperativeHandle(ref, () => ({
    centerOnOrigin: () => {
      // pendingPoint가 원점으로 리셋되는 것과 같은 타이밍에 호출되므로, 그 결과를 미리 반영한 경계로 계산한다.
      const b = getBounds([...shapes, { id: '_pending', layer: '_pending', kind: 'circle', center: { x: 0, y: 0 }, radiusMm: 400 }]);
      setPan({ x: -(b.minX + b.maxX) / 2, y: -(b.minY + b.maxY) / 2 });
    },
  }), [shapes]);

  const clientToMm = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };

  /** 화면 픽셀 단위 허용오차를 현재 확대 배율에 맞춰 mm로 환산 */
  const pxToMm = (px: number): number => {
    const ctm = svgRef.current?.getScreenCTM();
    const scale = ctm?.a || 1; // px per mm
    return px / scale;
  };

  /** 다른 도형들의 꼭짓점(선 끝점/원·사각형 중심) 목록 — 스냅 대상 */
  const snapTargets = (excludeIds: string[]): Point[] => {
    const pts: Point[] = [];
    for (const s of visibleShapes) {
      if (excludeIds.includes(s.id)) continue;
      pts.push(...getShapeVertices(s));
    }
    return pts;
  };

  /**
   * 선분 위 가이드 점(양끝/1·2·3분점)만 대상으로 하는 좁은 허용오차 스냅.
   * 원은 제외한다 — 원은 중심/둘레 자체가 선택 히트 영역과 겹쳐서, 우선 배치로 잡으면 원 선택이 아예 불가능해지기 때문.
   */
  const findLineGuideSnap = (mm: Point, tolerance: number): Point | null => {
    let best: Point | null = null;
    let bestDist = tolerance;
    for (const s of visibleShapes) {
      if (s.kind !== 'line') continue;
      const candidates = [s.start, lerpPoint(s.start, s.end, 0.25), lerpPoint(s.start, s.end, 0.5), lerpPoint(s.start, s.end, 0.75), s.end];
      for (const c of candidates) {
        const d = Math.hypot(c.x - mm.x, c.y - mm.y);
        if (d <= bestDist) {
          bestDist = d;
          best = c;
        }
      }
    }
    return best;
  };

  /**
   * 다음 도형의 시작점/중심점을 배치할 때 쓰는 확장 스냅.
   * 선은 양 끝점 + 1/4·1/2·3/4 지점, 원은 중심 + (커서 방향 기준) 원둘레 위 가장 가까운 점까지 후보로 삼는다.
   */
  const findPlacementSnap = (mm: Point, tolerance: number): Point | null => {
    let best: Point | null = null;
    let bestDist = tolerance;

    for (const s of visibleShapes) {
      let candidates: Point[];
      if (s.kind === 'line') {
        candidates = [s.start, lerpPoint(s.start, s.end, 0.25), lerpPoint(s.start, s.end, 0.5), lerpPoint(s.start, s.end, 0.75), s.end];
      } else if (s.kind === 'circle') {
        candidates = [s.center, nearestPointOnCircle(mm, s.center, s.radiusMm)];
      } else if (s.kind === 'text') {
        candidates = [s.position];
      } else {
        candidates = [s.center];
      }
      for (const c of candidates) {
        const d = Math.hypot(c.x - mm.x, c.y - mm.y);
        if (d <= bestDist) {
          bestDist = d;
          best = c;
        }
      }
    }

    return best;
  };

  /**
   * 겹친 도형 중 가장 "구체적인"(작은) 도형을 우선 선택한다.
   * 큰 반투명 원(스프링클러 살수반경)이 그 안의 작은 기둥을 가리지 않도록 하기 위함.
   */
  const findShapeAt = (mm: Point, tolerance: number): Shape | null => {
    let best: Shape | null = null;
    let bestSize = Infinity;

    for (const shape of selectableShapes) {
      let hit = false;
      let size = Infinity;

      if (shape.kind === 'line') {
        const thickness = shape.thicknessMm ?? DEFAULT_LINE_THICKNESS;
        const dist = distanceToSegment(mm, shape.start, shape.end);
        hit = dist <= thickness / 2 + tolerance;
        size = shape.lengthMm;
      } else if (shape.kind === 'circle') {
        const dist = Math.hypot(mm.x - shape.center.x, mm.y - shape.center.y);
        const isColumn = layerMap.get(shape.layer)?.category === 'column';
        hit = isColumn ? dist <= shape.radiusMm + tolerance : dist <= CENTER_DOT_RADIUS + tolerance || Math.abs(dist - shape.radiusMm) <= tolerance;
        size = shape.radiusMm;
      } else if (shape.kind === 'text') {
        const { width, height } = estimateTextBoxMm(shape.text);
        const dx = Math.abs(mm.x - shape.position.x);
        const dy = Math.abs(mm.y - shape.position.y);
        hit = dx <= width / 2 + tolerance && dy <= height / 2 + tolerance;
        size = width * height;
      } else {
        const dx = Math.abs(mm.x - shape.center.x);
        const dy = Math.abs(mm.y - shape.center.y);
        hit = dx <= shape.widthMm / 2 + tolerance && dy <= shape.heightMm / 2 + tolerance;
        size = shape.widthMm * shape.heightMm;
      }

      if (hit && size < bestSize) {
        best = shape;
        bestSize = size;
      }
    }

    return best;
  };

  const shapesInRect = (a: Point, b: Point): string[] => {
    const rectBounds = {
      minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
    };
    return selectableShapes.filter((s) => boundsIntersect(rectBounds, getShapeBounds(s))).map((s) => s.id);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const mm = clientToMm(e.clientX, e.clientY);
    if (!mm) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    // PC: 마우스 휠(가운데 버튼) 드래그로 화면 이동(팬)
    if (e.pointerType === 'mouse' && e.button === 1) {
      e.preventDefault();
      panRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPan: pan };
      return;
    }

    // 모바일: 두 손가락이 닿으면 핀치 확대/축소 + 화면 이동 제스처로 전환
    if (e.pointerType === 'touch') {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 2) {
        dragRef.current = null;
        marqueeRef.current = null;
        setMarquee(null);
        const pts = Array.from(pointersRef.current.values());
        pinchRef.current = {
          startDistPx: pointDistance(pts[0], pts[1]),
          startMid: pointMidpoint(pts[0], pts[1]),
          startZoom: zoom,
          startPan: pan,
        };
        return;
      }
    }

    // 선분의 중점/사분점을 정확히 겨냥해 클릭하면, 그 지점이 선 위라도 선택보다 배치를 우선한다.
    const precisePlacementSnap = findLineGuideSnap(mm, pxToMm(PLACEMENT_SNAP_PRIORITY_PX));
    if (precisePlacementSnap) {
      onSelect([]);
      onCanvasClick(precisePlacementSnap);
      return;
    }

    const hitShape = findShapeAt(mm, pxToMm(CLICK_TOLERANCE_PX));

    if (hitShape) {
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      let next: string[];
      if (additive) {
        next = selectedIds.includes(hitShape.id) ? selectedIds.filter((id) => id !== hitShape.id) : [...selectedIds, hitShape.id];
      } else if (selectedIds.includes(hitShape.id) && selectedIds.length > 1) {
        next = selectedIds; // 이미 다중 선택된 도형 중 하나를 클릭하면 그룹 유지
      } else {
        next = [hitShape.id];
      }
      onSelect(next);
      if (next.length > 0) {
        dragRef.current = { ids: next, lastMm: mm };
        dragSnappedRef.current = false;
      }
      return;
    }

    // 도형을 직접 클릭한 게 아니면 근처 가이드 점(꼭짓점/중점/사분점/원둘레)에 스냅해 다음 시작점/중심점을 놓는다.
    const vertexSnap = findPlacementSnap(mm, pxToMm(SNAP_TOLERANCE_PX));
    if (vertexSnap) {
      onSelect([]);
      onCanvasClick(vertexSnap);
      return;
    }

    if (e.pointerType === 'mouse') {
      // PC: 드래그로 여러 도형을 한번에 선택(마퀴). 실제 이동이 없으면 클릭으로 처리(아래 pointerup에서 판단)
      marqueeRef.current = { startMm: mm, moved: false };
    } else {
      // 터치/펜: 즉시 빈 공간 클릭으로 처리 (기존 동작 유지, 스냅은 위에서 이미 확인됨)
      onSelect([]);
      onCanvasClick({ x: Math.round(mm.x / 10) * 10, y: Math.round(mm.y / 10) * 10 });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const dxPx = e.clientX - panRef.current.startClientX;
      const dyPx = e.clientY - panRef.current.startClientY;
      setPan({ x: panRef.current.startPan.x - pxToMm(dxPx), y: panRef.current.startPan.y - pxToMm(dyPx) });
      return;
    }

    if (e.pointerType === 'touch' && pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinchRef.current && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = pointDistance(pts[0], pts[1]);
      const mid = pointMidpoint(pts[0], pts[1]);
      const scaleFactor = dist / (pinchRef.current.startDistPx || 1);
      const dxMm = pxToMm(mid.x - pinchRef.current.startMid.x);
      const dyMm = pxToMm(mid.y - pinchRef.current.startMid.y);
      setZoom(clamp(pinchRef.current.startZoom * scaleFactor, MIN_ZOOM, MAX_ZOOM));
      setPan({ x: pinchRef.current.startPan.x - dxMm, y: pinchRef.current.startPan.y - dyMm });
      return;
    }

    const mm = clientToMm(e.clientX, e.clientY);
    if (!mm) return;

    if (marqueeRef.current) {
      const started = marqueeRef.current.startMm;
      const movedPx = Math.hypot(mm.x - started.x, mm.y - started.y) / pxToMm(1);
      if (movedPx >= MARQUEE_THRESHOLD_PX || marqueeRef.current.moved) {
        marqueeRef.current.moved = true;
        setMarquee({ start: started, current: mm });
        onSelect(shapesInRect(started, mm));
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dx = mm.x - drag.lastMm.x;
    const dy = mm.y - drag.lastMm.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    // 이동 중인 도형(들)의 꼭짓점이 다른 도형 꼭짓점 근처에 오면 정확히 맞춘다 (CAD 스냅)
    const draggedShapes = shapes.filter((s) => drag.ids.includes(s.id));
    let snapDx = 0;
    let snapDy = 0;
    let snappedTo: Point | null = null;
    if (draggedShapes.length > 0) {
      const targets = snapTargets(drag.ids);
      // 이미 스냅된 상태라면 더 작은 허용오차를 써서 살짝만 움직여도 빨리 떨어지게 한다.
      const tolerance = pxToMm(dragSnappedRef.current ? SNAP_RELEASE_TOLERANCE_PX : SNAP_TOLERANCE_PX);
      let bestDist = tolerance;
      for (const shape of draggedShapes) {
        const tentative = translateShape(shape, dx, dy);
        for (const vertex of getShapeVertices(tentative)) {
          const nearest = findNearestVertex(vertex, targets, tolerance);
          if (nearest) {
            const d = Math.hypot(nearest.x - vertex.x, nearest.y - vertex.y);
            if (d <= bestDist) {
              bestDist = d;
              snapDx = nearest.x - vertex.x;
              snapDy = nearest.y - vertex.y;
              snappedTo = nearest;
            }
          }
        }
      }
    }

    onMoveShapes(drag.ids, Math.round(dx + snapDx), Math.round(dy + snapDy));
    drag.lastMm = mm;
    dragSnappedRef.current = snappedTo !== null;
    setSnapMarker(snappedTo);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }

    if (e.pointerType === 'touch') {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
      }
    }

    if (marqueeRef.current) {
      if (!marqueeRef.current.moved) {
        // 실제로는 드래그하지 않은 단순 클릭 — 빈 공간 클릭으로 처리 (스냅 대상은 pointerdown에서 이미 확인됨)
        const mm = marqueeRef.current.startMm;
        onSelect([]);
        onCanvasClick({ x: Math.round(mm.x / 10) * 10, y: Math.round(mm.y / 10) * 10 });
      }
      marqueeRef.current = null;
      setMarquee(null);
    }
    dragRef.current = null;
    dragSnappedRef.current = false;
    setSnapMarker(null);
  };

  return (
    <div className="cad-canvas-wrap">
      <svg
        ref={svgRef}
        className="cad-canvas"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <pattern id="grid" width={GRID_MM} height={GRID_MM} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID_MM} 0 L 0 0 0 ${GRID_MM}`} fill="none" stroke="var(--border)" strokeWidth={8} />
          </pattern>
        </defs>
        <rect x={centerX - viewWidth / 2} y={centerY - viewHeight / 2} width={viewWidth} height={viewHeight} fill="url(#grid)" />

        {visibleShapes.map((shape) => {
          const color = layerMap.get(shape.layer)?.color ?? 'var(--text)';
          const isSelected = selectedIds.includes(shape.id);
          // 그릴 레이어가 아닌 도형은 선택은 안 되지만, 구분을 위해 살짝 흐리게 표시
          const opacity = activeLayerId === ALL_LAYERS_ID || shape.layer === activeLayerId ? 1 : 0.5;

          if (shape.kind === 'line') {
            const strokeWidth = shape.thicknessMm ?? DEFAULT_LINE_THICKNESS;
            const midX = (shape.start.x + shape.end.x) / 2;
            const midY = (shape.start.y + shape.end.y) / 2;
            const dx = shape.end.x - shape.start.x;
            const dy = shape.end.y - shape.start.y;
            const segLen = Math.hypot(dx, dy) || 1;
            const offset = Math.max(strokeWidth / 2 + LENGTH_LABEL_OFFSET_MM, LENGTH_LABEL_OFFSET_MM);
            const labelX = midX + (-dy / segLen) * offset;
            const labelY = midY + (dx / segLen) * offset;
            return (
              <g key={shape.id} opacity={opacity} pointerEvents="none">
                <line
                  x1={shape.start.x}
                  y1={shape.start.y}
                  x2={shape.end.x}
                  y2={shape.end.y}
                  stroke={isSelected ? 'var(--primary)' : color}
                  strokeWidth={isSelected ? Math.max(strokeWidth, 40) : strokeWidth}
                  strokeLinecap="round"
                />
                <text x={labelX} y={labelY} textAnchor="middle" className="cad-dim-label">
                  {formatMeters(shape.lengthMm)}
                </text>
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const p = lerpPoint(shape.start, shape.end, t);
                  return <circle key={t} cx={p.x} cy={p.y} r={GUIDE_DOT_RADIUS} className="cad-guide-dot" />;
                })}
              </g>
            );
          }

          if (shape.kind === 'rect') {
            return (
              <g key={shape.id} opacity={opacity} pointerEvents="none">
                <rect
                  x={shape.center.x - shape.widthMm / 2}
                  y={shape.center.y - shape.heightMm / 2}
                  width={shape.widthMm}
                  height={shape.heightMm}
                  fill={color}
                  fillOpacity={0.35}
                  stroke={isSelected ? 'var(--primary)' : color}
                  strokeWidth={isSelected ? 30 : 18}
                />
                {shape.label && (
                  <text x={shape.center.x} y={shape.center.y - shape.heightMm / 2 - 60} textAnchor="middle" className="cad-label">
                    {shape.label}
                  </text>
                )}
              </g>
            );
          }

          if (shape.kind === 'text') {
            const { width, height } = estimateTextBoxMm(shape.text);
            return (
              <g key={shape.id} opacity={opacity} pointerEvents="none">
                {isSelected && (
                  <rect
                    x={shape.position.x - width / 2}
                    y={shape.position.y - height / 2}
                    width={width}
                    height={height}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={16}
                    strokeDasharray="30 20"
                  />
                )}
                <text
                  x={shape.position.x}
                  y={shape.position.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="cad-text-shape"
                  fill={color}
                >
                  {shape.text}
                </text>
              </g>
            );
          }

          return (
            <g key={shape.id} opacity={opacity} pointerEvents="none">
              <circle
                cx={shape.center.x}
                cy={shape.center.y}
                r={shape.radiusMm}
                fill={color}
                fillOpacity={0.08}
                stroke={isSelected ? 'var(--primary)' : color}
                strokeWidth={isSelected ? 30 : 18}
                strokeDasharray={layerMap.get(shape.layer)?.category === 'sprinkler' ? '60 40' : undefined}
              />
              <circle cx={shape.center.x} cy={shape.center.y} r={layerMap.get(shape.layer)?.category === 'column' ? shape.radiusMm : CENTER_DOT_RADIUS} fill={color} />
              {shape.label && (
                <text x={shape.center.x} y={shape.center.y - shape.radiusMm - 60} textAnchor="middle" className="cad-label">
                  {shape.label}
                </text>
              )}
              {(() => {
                const labelPos = pointFromPolar(shape.center, shape.radiusMm + RADIUS_LABEL_MARGIN_MM, 135);
                return (
                  <text x={labelPos.x} y={labelPos.y} textAnchor="middle" className="cad-dim-label">
                    {formatMeters(shape.radiusMm)}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* 다음 도형의 시작점/중심점 표시 (클릭으로 위치 변경 가능, 근처 꼭짓점에 자동 스냅) */}
        <g className="cad-pending" pointerEvents="none">
          <line x1={pendingPoint.x - 180} y1={pendingPoint.y} x2={pendingPoint.x + 180} y2={pendingPoint.y} />
          <line x1={pendingPoint.x} y1={pendingPoint.y - 180} x2={pendingPoint.x} y2={pendingPoint.y + 180} />
          <circle cx={pendingPoint.x} cy={pendingPoint.y} r={120} />
          <text x={pendingPoint.x + 220} y={pendingPoint.y - 220}>
            {mode === 'line' ? '시작점' : mode === 'text' ? '텍스트 위치' : '중심점'}
          </text>
        </g>

        {/* 드래그 중 스냅된 꼭짓점 표시 */}
        {snapMarker && (
          <g className="cad-snap-marker" pointerEvents="none">
            <circle cx={snapMarker.x} cy={snapMarker.y} r={160} />
            <line x1={snapMarker.x - 220} y1={snapMarker.y} x2={snapMarker.x + 220} y2={snapMarker.y} />
            <line x1={snapMarker.x} y1={snapMarker.y - 220} x2={snapMarker.x} y2={snapMarker.y + 220} />
          </g>
        )}

        {/* PC 드래그 다중 선택 영역 */}
        {marquee && (
          <rect
            className="cad-marquee"
            x={Math.min(marquee.start.x, marquee.current.x)}
            y={Math.min(marquee.start.y, marquee.current.y)}
            width={Math.abs(marquee.current.x - marquee.start.x)}
            height={Math.abs(marquee.current.y - marquee.start.y)}
            pointerEvents="none"
          />
        )}
      </svg>

      <div className="cad-quick-actions">
        <button type="button" className="cad-zoom-btn" onClick={onUndo} disabled={!canUndo} aria-label="실행 취소">
          <IconUndo />
        </button>
      </div>

      <div className="cad-zoom-controls">
        <button type="button" className="cad-zoom-btn" onClick={() => setZoom((z) => clamp(z / BUTTON_ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))} aria-label="축소">
          <IconZoomOut />
        </button>
        <span className="cad-zoom-level">{Math.round(zoom * 100)}%</span>
        <button type="button" className="cad-zoom-btn" onClick={() => setZoom((z) => clamp(z * BUTTON_ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))} aria-label="확대">
          <IconZoomIn />
        </button>
        <button type="button" className="cad-zoom-btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="화면 맞춤">
          <IconFit />
        </button>
      </div>
    </div>
  );
});

export default CadCanvas;
