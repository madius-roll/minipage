import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ArcShape, CircleShape, Layer, LineShape, Point, RectShape, Shape, Underlay } from '../../types/cad';
import {
  boundsIntersect,
  computeSprinklerCoveragePolygon,
  DEFAULT_LINE_THICKNESS_MM,
  distanceMm,
  distanceToSegment,
  estimateTextBoxMm,
  findNearestVertex,
  formatMeters,
  getBounds,
  getShapeBounds,
  getShapeVertices,
  isAngleWithinArc,
  lengthAndAngleBetween,
  lerpPoint,
  nearestPointOnCircle,
  pointAngleDeg,
  pointFromPolar,
  rectToLineEdges,
  translateShape,
  trimCircleAtPoint,
  trimLineAtPoint,
} from '../../utils/geometry';
import { ALL_LAYERS_ID } from '../../data/layerMeta';
import type { DrawMode } from '../layout/ToolPanel';
import type { Bounds } from '../../utils/geometry';
import type { MmRect } from '../../utils/review';
import { IconFit, IconRedo, IconRuler, IconTarget, IconTrash, IconUndo, IconZoomIn, IconZoomOut } from '../ui/Icon';
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
  /** 잡은 도형이 실제로 움직이기 시작하는 순간 한 번만 호출 — 실행취소 히스토리 저장용 (클릭만 하고 놓으면 호출되지 않는다) */
  onDragStart: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  activeLayerId: string;
  onDeleteSelected: () => void;
  onResetPending: () => void;
  /** TR(트림): removedId 도형을 지우고 kept 조각들(선/호)로 대체 */
  onTrimLine: (removedId: string, kept: (LineShape | ArcShape)[]) => void;
  /** 마우스로 직접 그리기 무장 상태 — 켜져 있으면 캔버스 클릭으로 시작점→끝점을 순서대로 찍어 도형을 완성한다 */
  drawArmed: boolean;
  /** 무장 상태에서 다음 클릭이 시작점을 찍는 차례인지, 끝점을 찍어 도형을 완성하는 차례인지 */
  drawPhase: 'start' | 'end';
  /** 무장 상태에서 클릭 확정 시 호출 — pendingPoint를 시작점/중심점으로 삼아 부모가 실제 도형을 만든다 */
  onFinishDraw: (point: Point) => void;
  /** 무장 상태에서 미리보기로 그릴 도형 종류 (기둥 레이어의 사각형 옵션 포함) */
  drawPreviewKind: 'line' | 'circle' | 'rect';
  /** 직교 고정 — 켜져 있거나 Shift를 누른 채로 그리면 선은 0°/45°/90° 방향, 사각형은 정사각형으로 맞춘다 */
  orthoLock: boolean;
  /** 방호 검토에서 계산한 미방호 구역(mm) — 빈 배열이면 표시하지 않는다 */
  uncoveredRects: MmRect[];
  /** 바닥에 깔아 둔 도면 사진·PDF — 선택되거나 움직이지 않는 배경이다 */
  underlay: Underlay | null;
  /** 거리 재기 모드 — 켜져 있는 동안은 클릭이 선택/그리기 대신 두 점 찍기로 동작한다 */
  measureMode: boolean;
  onToggleMeasure: () => void;
  measure: { a: Point; b: Point | null } | null;
  onMeasurePoint: (point: Point) => void;
}

export interface CadCanvasHandle {
  /** 원점(0,0)이 화면 정중앙에 오도록 이동(줌 배율은 유지) */
  centerOnOrigin: () => void;
}

const GRID_MM = 500;
/** 격자 한 칸이 화면에서 이보다 촘촘해지면 10배 큰 격자로 바꾼다 */
const MIN_GRID_PX = 8;
const CENTER_DOT_RADIUS = 40;
const CLICK_TOLERANCE_PX = 10;
const SNAP_TOLERANCE_PX = 18;
/** 스냅 상태에서 떨어져 나갈 때는 더 작은 허용오차를 써서 더 빨리 분리되게 한다 */
const SNAP_RELEASE_TOLERANCE_PX = 6;
/*
 * 라벨·가이드 점·외곽선 굵기는 도면(mm)이 아니라 화면(px) 기준으로 그린다.
 * 그래야 축소해도 글자가 읽히고, 확대해도 글자가 화면을 뒤덮지 않는다. 아래 값들은 모두 화면 px이다.
 */
/** 이름·치수 라벨을 도형 위아래로 띄우는 거리 */
const LABEL_GAP_PX = 11;
/** 선 길이 라벨을 선에서 옆으로 띄우는 거리 — 세로선 옆에 놓이면 글자 폭의 절반이 선 쪽으로 뻗으므로 더 넉넉히 둔다 */
const LINE_LABEL_GAP_PX = 16;
/** 선분 위 배치 가이드 점(양끝/중점/사분점) 반지름 */
const GUIDE_DOT_PX = 2.5;
/** 화면에서 이보다 짧은 선은 치수 라벨과 가이드 점을 생략한다 (서로 겹쳐 읽을 수 없게 된다) */
const MIN_LABELED_LINE_PX = 44;
/** 도형 외곽선의 최소 굵기 — 실제 두께(mm)가 화면에서 이보다 가늘어지면 이 굵기로 그린다 */
const OUTLINE_PX = 1.5;
const SELECTED_OUTLINE_PX = 3;
/** 직교 고정 시 맞추는 각도 간격(도) */
const ORTHO_STEP_DEG = 45;
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
  { shapes, layers, selectedIds, onSelect, pendingPoint, mode, onCanvasClick, onMoveShapes, onDragStart, onUndo, canUndo, onRedo, canRedo, activeLayerId, onDeleteSelected, onResetPending, onTrimLine, drawArmed, drawPhase, onFinishDraw, drawPreviewKind, orthoLock, uncoveredRects, underlay, measureMode, onToggleMeasure, measure, onMeasurePoint },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  /** TR(트림) 모드: 켜져 있는 동안은 클릭이 선택/그리기 대신 "겹치는 지점의 선분 잘라내기"로 동작한다 */
  const [trimMode, setTrimMode] = useState(false);
  /** 마우스로 그리기 무장 상태에서, 커서를 따라다니는 미리보기 끝점/반지름 지점 (스냅 보정 적용됨) */
  const [drawPreview, setDrawPreview] = useState<Point | null>(null);
  /** 거리 재기에서 첫 점을 찍은 뒤, 커서를 따라다니는 두 번째 점 미리보기 */
  const [measureHover, setMeasureHover] = useState<Point | null>(null);
  /**
   * originalShapes/totalDx/totalDy: 드래그 시작 시점의 원본 위치 기준 "진짜" 누적 이동량.
   * appliedDx/appliedDy: 지금까지 onMoveShapes로 실제 반영한 누적량(스냅 보정 포함).
   * 이렇게 분리해야, 스냅으로 붙은 뒤 매 프레임 아주 조금씩 움직여도(실제 사람 손 드래그처럼)
   * "진짜" 이동량은 계속 누적되어 결국 허용오차를 넘어서면서 정상적으로 떨어진다.
   * (이전에는 매 프레임 델타를 이미 스냅 보정된 상태 위에 얹어 계산해서, 아주 조금씩 움직이면
   * 매번 다시 같은 지점으로 붙어버려 영원히 분리되지 않는 버그가 있었다.)
   */
  const dragRef = useRef<{
    ids: string[];
    lastMm: Point;
    originalShapes: Shape[];
    totalDx: number;
    totalDy: number;
    appliedDx: number;
    appliedDy: number;
    historyPushed: boolean;
  } | null>(null);
  const dragSnappedRef = useRef(false);
  const marqueeRef = useRef<{ startMm: Point; moved: boolean } | null>(null);
  const panRef = useRef<{ startClientX: number; startClientY: number; startPan: Point } | null>(null);
  /** 스페이스바를 누르고 있는 동안은 왼쪽 버튼 드래그가 화면 이동(팬)으로 동작한다 — 가운데 버튼이 없는 트랙패드용 */
  const [spaceHeld, setSpaceHeld] = useState(false);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);
  const [snapMarker, setSnapMarker] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  /** 캔버스 영역의 화면 크기(px) — 화면 px ↔ 도면 mm 환산에 쓴다 */
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 700 });
  const layerMap = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const visibleShapes = shapes.filter((s) => layerMap.get(s.layer)?.visible !== false);
  /** 클릭/드래그로 선택 가능한 도형 — "그릴 레이어"로 선택된 레이어의 도형만 (다른 레이어는 보이되 선택은 안 됨) */
  const selectableShapes = activeLayerId === ALL_LAYERS_ID ? visibleShapes : visibleShapes.filter((s) => s.layer === activeLayerId);
  /** SP헤드반경의 방호 범위를 가로막는 장애물 — 벽체·기둥 레이어의 도형만 해당 */
  const sprinklerObstacles = visibleShapes.filter((s) => {
    const category = layerMap.get(s.layer)?.category;
    return category === 'wall' || category === 'column';
  });

  /** TR에서 "자르는 날"이 되는 도형 — SP헤드반경 원은 실제 물체가 아니라 방호범위 표시라서 뺀다 (안 빼면 벽이 아닌 보이지 않는 원 둘레에서 잘린다) */
  const trimCutters = visibleShapes.filter((s) => !(s.kind === 'circle' && s.sprinklerHead));

  /**
   * 뷰포트의 기준 크기/중심은 도형이 이동·추가될 때마다 다시 계산하지 않고 한 번 고정해 둔다.
   * (예전에는 매 렌더마다 전체 도형의 바운딩박스로 다시 맞췄는데, 그러면 도형을 멀리 드래그할 때마다
   * 바운딩박스가 커지면서 화면 비율(줌)이 저절로 축소되어 보이는 문제가 있었다.)
   * "화면 맞춤" 버튼을 눌렀을 때만 명시적으로 현재 도형 기준으로 다시 계산한다.
   */
  const computeBaseView = (shapesArg: Shape[], pendingArg: Point) => {
    const extras: Shape[] = [{ id: '_pending', layer: '_pending', kind: 'circle', center: pendingArg, radiusMm: 400 }];
    // 바탕 도면이 깔려 있으면 그 전체가 보이도록 화면 맞춤 범위에 넣는다
    if (underlay?.visible) {
      const widthMm = underlay.widthPx * underlay.mmPerPx;
      const heightMm = underlay.heightPx * underlay.mmPerPx;
      extras.push({ id: '_underlay', layer: '_underlay', kind: 'rect', center: { x: underlay.origin.x + widthMm / 2, y: underlay.origin.y + heightMm / 2 }, widthMm, heightMm });
    }
    const b = getBounds([...shapesArg, ...extras]);
    const padding = 800;
    return {
      width: b.maxX - b.minX + padding * 2,
      height: b.maxY - b.minY + padding * 2,
      centerX: (b.minX + b.maxX) / 2,
      centerY: (b.minY + b.maxY) / 2,
    };
  };
  const baseViewRef = useRef<{ width: number; height: number; centerX: number; centerY: number } | null>(null);
  if (!baseViewRef.current) {
    baseViewRef.current = computeBaseView(shapes, pendingPoint);
  }
  const { width: baseWidth, height: baseHeight, centerX: baseCenterX, centerY: baseCenterY } = baseViewRef.current;
  const viewWidth = baseWidth / zoom;
  const viewHeight = baseHeight / zoom;
  const centerX = baseCenterX + pan.x;
  const centerY = baseCenterY + pan.y;
  const gridSpan = Math.max(viewWidth, viewHeight) * 6;
  /** 화면 1px이 도면에서 몇 mm인지 — 라벨·외곽선을 화면 기준 크기로 그릴 때 곱한다 */
  const mmPerPx = 1 / (Math.min(canvasSize.width / viewWidth, canvasSize.height / viewHeight) || 1);
  const px = (value: number) => value * mmPerPx;
  const gridStep = GRID_MM / mmPerPx >= MIN_GRID_PX ? GRID_MM : GRID_MM * 10;
  const viewBox = `${centerX - viewWidth / 2} ${centerY - viewHeight / 2} ${viewWidth} ${viewHeight}`;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setCanvasSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  /** 휠 핸들러(한 번만 등록)가 항상 최신 줌/팬 값을 읽을 수 있게 해 주는 거울 */
  const viewStateRef = useRef({ zoom, pan });
  viewStateRef.current = { zoom, pan };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // 휠 줌은 커서가 가리키는 지점이 화면에서 제자리에 머물도록 팬을 함께 보정한다
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const base = baseViewRef.current;
      if (!base) return;
      const { zoom: z, pan: p } = viewStateRef.current;
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      const nextZoom = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
      if (nextZoom === z) return;
      const rect = svg.getBoundingClientRect();
      const pxPerMm = Math.min(rect.width / (base.width / z), rect.height / (base.height / z)) || 1;
      // 화면 중심에서 커서까지의 거리(mm) — 줌 배율이 바뀐 만큼 이 거리가 줄거나 늘어나므로 그 차이를 팬으로 메운다
      const offsetX = (e.clientX - (rect.left + rect.width / 2)) / pxPerMm;
      const offsetY = (e.clientY - (rect.top + rect.height / 2)) / pxPerMm;
      const keep = 1 - z / nextZoom;
      const nextPan = { x: p.x + offsetX * keep, y: p.y + offsetY * keep };
      viewStateRef.current = { zoom: nextZoom, pan: nextPan };
      setZoom(nextZoom);
      setPan(nextPan);
    };
    svg.addEventListener('wheel', onWheelNative, { passive: false });
    return () => svg.removeEventListener('wheel', onWheelNative);
  }, []);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return;
      // 포커스가 남아 있던 버튼이 스페이스로 눌리거나 페이지가 스크롤되지 않게 막는다
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!isEditable(e.target)) e.preventDefault();
      setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // TR 모드는 Esc로 끈다 — 캡처 단계에서 먼저 받아, 같은 Esc가 그리기 취소까지 한꺼번에 일으키지 않게 한다
  useEffect(() => {
    if (!trimMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setTrimMode(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [trimMode]);

  const centerOnOriginNow = () => {
    const { centerX: base, centerY: baseY } = baseViewRef.current!;
    setPan({ x: -base, y: -baseY });
  };

  useImperativeHandle(ref, () => ({
    centerOnOrigin: centerOnOriginNow,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const handleResetPendingClick = () => {
    onResetPending();
    centerOnOriginNow();
  };

  // 무장이 풀리거나(취소, 모드/레이어 변경 등) 도형이 확정되어 다시 시작점 차례로 돌아가면 남아있던 미리보기를 지운다.
  useEffect(() => {
    if (!drawArmed || drawPhase === 'start') setDrawPreview(null);
  }, [drawArmed, drawPhase]);

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

  /** 다른 도형들의 스냅 대상 점 — 선은 양 끝점 + 1/4·1/2·3/4 지점, 원·사각형·텍스트는 중심/위치 */
  const snapTargets = (excludeIds: string[]): Point[] => {
    const pts: Point[] = [];
    for (const s of visibleShapes) {
      if (excludeIds.includes(s.id)) continue;
      if (s.kind === 'line') {
        pts.push(s.start, lerpPoint(s.start, s.end, 0.25), lerpPoint(s.start, s.end, 0.5), lerpPoint(s.start, s.end, 0.75), s.end);
      } else {
        pts.push(...getShapeVertices(s));
      }
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
        // SP헤드반경의 둘레는 실제 물체가 아니라 방호범위 표시일 뿐이라 중심(헤드 위치)에만 붙인다
        candidates = s.sprinklerHead ? [s.center] : [s.center, nearestPointOnCircle(mm, s.center, s.radiusMm)];
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

  /** 마우스로 그리기 무장 상태에서 끝점/반지름 지점을 정할 때 쓰는 스냅 우선순위 — 다른 도형 꼭짓점에 붙이고, 없으면 10mm 격자에 반올림 */
  const resolveDrawPoint = (mm: Point): Point => {
    return (
      findLineGuideSnap(mm, pxToMm(PLACEMENT_SNAP_PRIORITY_PX)) ??
      findPlacementSnap(mm, pxToMm(SNAP_TOLERANCE_PX)) ??
      { x: Math.round(mm.x / 10) * 10, y: Math.round(mm.y / 10) * 10 }
    );
  };

  /** 거리 재기용 — 바탕 도면 위의 임의 지점을 재는 일이 많으므로 격자에 반올림하지 않고 mm 단위 그대로 쓴다 */
  const resolveMeasurePoint = (mm: Point): Point => (
    findLineGuideSnap(mm, pxToMm(PLACEMENT_SNAP_PRIORITY_PX)) ?? { x: Math.round(mm.x), y: Math.round(mm.y) }
  );

  /**
   * 직교 고정: 끝점을 시작점(pendingPoint) 기준 0°/45°/90° 방향 위로 옮긴다 (사각형은 정사각형이 되게).
   * 스냅으로 잡은 점을 그 방향에 수직으로 내려 맞추므로, 다른 도형의 꼭짓점 높이에 맞춰 수평·수직선을 그릴 수 있다.
   */
  const applyOrtho = (point: Point): Point => {
    const dx = point.x - pendingPoint.x;
    const dy = point.y - pendingPoint.y;
    if (drawPreviewKind === 'rect') {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      return { x: pendingPoint.x + (dx < 0 ? -side : side), y: pendingPoint.y + (dy < 0 ? -side : side) };
    }
    if (drawPreviewKind !== 'line' || (dx === 0 && dy === 0)) return point;
    const step = (ORTHO_STEP_DEG * Math.PI) / 180;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const length = dx * Math.cos(angle) + dy * Math.sin(angle);
    return { x: Math.round(pendingPoint.x + length * Math.cos(angle)), y: Math.round(pendingPoint.y + length * Math.sin(angle)) };
  };

  /** 끝점(두 번째 클릭) 위치 — 스냅을 먼저 적용하고, 직교 고정이 켜져 있거나 Shift를 누르고 있으면 방향을 맞춘다 */
  const resolveEndPoint = (mm: Point, shiftKey: boolean): Point => {
    const snapped = resolveDrawPoint(mm);
    return orthoLock || shiftKey ? applyOrtho(snapped) : snapped;
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
        const thickness = shape.thicknessMm ?? DEFAULT_LINE_THICKNESS_MM;
        const dist = distanceToSegment(mm, shape.start, shape.end);
        hit = dist <= thickness / 2 + tolerance;
        size = shape.lengthMm;
      } else if (shape.kind === 'circle') {
        const dist = Math.hypot(mm.x - shape.center.x, mm.y - shape.center.y);
        const isColumn = layerMap.get(shape.layer)?.category === 'column';
        const onCenter = dist <= CENTER_DOT_RADIUS + tolerance;
        hit = isColumn ? dist <= shape.radiusMm + tolerance : onCenter || Math.abs(dist - shape.radiusMm) <= tolerance;
        // SP헤드반경은 방 전체를 덮는 큰 원이라 둘레가 벽·보와 자주 겹친다 — 둘레로 잡힌 경우엔 겹친 다른 도형에 양보한다
        size = shape.sprinklerHead && !onCenter ? Number.MAX_VALUE : shape.radiusMm;
      } else if (shape.kind === 'text') {
        const { width, height } = estimateTextBoxMm(shape.text);
        const dx = Math.abs(mm.x - shape.position.x);
        const dy = Math.abs(mm.y - shape.position.y);
        hit = dx <= width / 2 + tolerance && dy <= height / 2 + tolerance;
        size = width * height;
      } else if (shape.kind === 'arc') {
        const dist = Math.hypot(mm.x - shape.center.x, mm.y - shape.center.y);
        const angle = pointAngleDeg(shape.center, mm);
        hit = Math.abs(dist - shape.radiusMm) <= tolerance && isAngleWithinArc(angle, shape.startAngleDeg, shape.endAngleDeg);
        size = shape.radiusMm;
      } else {
        const dx = Math.abs(mm.x - shape.center.x);
        const dy = Math.abs(mm.y - shape.center.y);
        hit = dx <= shape.widthMm / 2 + tolerance && dy <= shape.heightMm / 2 + tolerance;
        size = shape.widthMm * shape.heightMm;
      }

      if (hit && (size < bestSize || best === null)) {
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

  /** TR로 클릭한 대상 — 선은 그대로, 사각형은 클릭한 변만 트림 대상 선으로 분해해 다루고, 원은 둘레를 호(arc) 하나로 잘라낸다 */
  type TrimTarget =
    | { kind: 'line'; shape: LineShape }
    | { kind: 'rectEdge'; rect: RectShape; edges: LineShape[]; edgeIndex: number }
    | { kind: 'circle'; shape: CircleShape };

  /** TR 모드 전용: 레이어 구분 없이(활성 레이어 제한 무시) 클릭 지점에서 가장 가까운 선/사각형 변/원 둘레를 찾는다 */
  const findNearestTrimTarget = (mm: Point, tolerance: number): TrimTarget | null => {
    let best: TrimTarget | null = null;
    let bestDist = Infinity;
    for (const s of visibleShapes) {
      if (s.kind === 'line') {
        const thickness = s.thicknessMm ?? DEFAULT_LINE_THICKNESS_MM;
        const dist = distanceToSegment(mm, s.start, s.end);
        if (dist <= thickness / 2 + tolerance && dist < bestDist) {
          bestDist = dist;
          best = { kind: 'line', shape: s };
        }
      } else if (s.kind === 'rect') {
        const edges = rectToLineEdges(s);
        edges.forEach((edge, edgeIndex) => {
          const dist = distanceToSegment(mm, edge.start, edge.end);
          if (dist <= DEFAULT_LINE_THICKNESS_MM / 2 + tolerance && dist < bestDist) {
            bestDist = dist;
            best = { kind: 'rectEdge', rect: s, edges, edgeIndex };
          }
        });
      } else if (s.kind === 'circle' && !s.sprinklerHead) {
        // SP헤드반경은 장애물에 맞춰 자동으로 잘려 그려지므로 TR 대상에서 뺀다 (호로 바뀌면 헤드 정보·방호범위 계산을 잃는다)
        const dist = Math.abs(distanceMm(mm, s.center) - s.radiusMm);
        if (dist <= DEFAULT_LINE_THICKNESS_MM / 2 + tolerance && dist < bestDist) {
          bestDist = dist;
          best = { kind: 'circle', shape: s };
        }
      }
    }
    return best;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const mm = clientToMm(e.clientX, e.clientY);
    if (!mm) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    // PC: 마우스 휠(가운데 버튼) 드래그 또는 스페이스+왼쪽 드래그로 화면 이동(팬)
    if (e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && spaceHeld))) {
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

    // 거리 재기: 첫 클릭이 A, 두 번째 클릭이 B. 도형의 끝점·중점 가까이를 찍으면 그 점에 붙고, 아니면 찍은 자리 그대로 쓴다.
    if (measureMode) {
      onMeasurePoint(resolveMeasurePoint(mm));
      setMeasureHover(null);
      return;
    }

    // TR(트림) 모드: 다른 도형과 겹치거나 가로지르는 지점을 클릭하면 그 구간만 잘라낸다. 선택/그리기는 하지 않는다.
    if (trimMode) {
      const target = findNearestTrimTarget(mm, pxToMm(CLICK_TOLERANCE_PX));
      if (target?.kind === 'line') {
        const result = trimLineAtPoint(target.shape, mm, trimCutters);
        if (result) onTrimLine(result.removedId, result.kept);
      } else if (target?.kind === 'rectEdge') {
        // 클릭한 변만 다른 도형들과 교차 지점 기준으로 자르고, 나머지 세 변은 그대로 선으로 남긴다
        const clickedEdge = target.edges[target.edgeIndex];
        const otherEdges = target.edges.filter((_, i) => i !== target.edgeIndex);
        const others = trimCutters.filter((s) => s.id !== target.rect.id);
        const result = trimLineAtPoint(clickedEdge, mm, others);
        if (result) onTrimLine(target.rect.id, [...result.kept, ...otherEdges]);
      } else if (target?.kind === 'circle') {
        const others = trimCutters.filter((s) => s.id !== target.shape.id);
        const result = trimCircleAtPoint(target.shape, mm, others);
        if (result) onTrimLine(result.removedId, result.kept);
      }
      return;
    }

    // 마우스로 그리기 무장 상태: 첫 클릭은 시작점/중심점, 두 번째 클릭은 도형 확정 (선택/드래그/재배치는 하지 않는다)
    if (drawArmed && mode !== 'text') {
      const point = resolveDrawPoint(mm);
      if (drawPhase === 'start') {
        onCanvasClick(point);
      } else {
        onFinishDraw(resolveEndPoint(mm, e.shiftKey));
      }
      return;
    }

    // 선택 도구에서는 클릭이 시작점을 옮기지 않는다 — 도형 선택/이동과 빈 곳 드래그(마퀴)만 한다
    const isSelectMode = mode === 'select';

    // 선분의 중점/사분점을 정확히 겨냥해 클릭하면, 그 지점이 선 위라도 선택보다 배치를 우선한다.
    const precisePlacementSnap = isSelectMode ? null : findLineGuideSnap(mm, pxToMm(PLACEMENT_SNAP_PRIORITY_PX));
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
        dragRef.current = {
          ids: next,
          lastMm: mm,
          originalShapes: shapes.filter((s) => next.includes(s.id)),
          totalDx: 0,
          totalDy: 0,
          appliedDx: 0,
          appliedDy: 0,
          historyPushed: false,
        };
        dragSnappedRef.current = false;
      }
      return;
    }

    // 도형을 직접 클릭한 게 아니면 근처 가이드 점(꼭짓점/중점/사분점/원둘레)에 스냅해 다음 시작점/중심점을 놓는다.
    const vertexSnap = isSelectMode ? null : findPlacementSnap(mm, pxToMm(SNAP_TOLERANCE_PX));
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
      if (!isSelectMode) onCanvasClick({ x: Math.round(mm.x / 10) * 10, y: Math.round(mm.y / 10) * 10 });
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

    if (measureMode) {
      setMeasureHover(measure && !measure.b ? resolveMeasurePoint(mm) : null);
      return;
    }

    if (drawArmed && mode !== 'text') {
      // 시작점을 찍기 전(phase start)에는 도형 미리보기를 그리지 않는다 — pendingPoint가 아직 이번 도형의 기준점이 아니기 때문
      setDrawPreview(drawPhase === 'end' ? resolveEndPoint(mm, e.shiftKey) : null);
      return;
    }

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
    const rawDx = mm.x - drag.lastMm.x;
    const rawDy = mm.y - drag.lastMm.y;
    if (Math.abs(rawDx) < 1 && Math.abs(rawDy) < 1) return;
    drag.lastMm = mm;
    // 원본 위치 기준 "진짜" 누적 이동량 — 스냅 보정과 무관하게 커서를 따라 계속 쌓인다.
    drag.totalDx += rawDx;
    drag.totalDy += rawDy;

    // 이동 중인 도형(들)의 꼭짓점이 다른 도형 꼭짓점 근처에 오면 정확히 맞춘다 (CAD 스냅)
    let snapDx = 0;
    let snapDy = 0;
    let snappedTo: Point | null = null;
    if (drag.originalShapes.length > 0) {
      const targets = snapTargets(drag.ids);
      // 이미 스냅된 상태라면 더 작은 허용오차를 써서 살짝만 움직여도 빨리 떨어지게 한다.
      const tolerance = pxToMm(dragSnappedRef.current ? SNAP_RELEASE_TOLERANCE_PX : SNAP_TOLERANCE_PX);
      let bestDist = tolerance;
      for (const shape of drag.originalShapes) {
        const tentative = translateShape(shape, drag.totalDx, drag.totalDy);
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

    // 지금까지 실제로 반영한 양(appliedDx/Dy)과의 차이만 이번 프레임에 내보낸다.
    const finalDx = Math.round(drag.totalDx + snapDx);
    const finalDy = Math.round(drag.totalDy + snapDy);
    const outDx = finalDx - drag.appliedDx;
    const outDy = finalDy - drag.appliedDy;
    if (outDx !== 0 || outDy !== 0) {
      if (!drag.historyPushed) {
        onDragStart();
        drag.historyPushed = true;
      }
      onMoveShapes(drag.ids, outDx, outDy);
      drag.appliedDx = finalDx;
      drag.appliedDy = finalDy;
    }
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
        if (mode !== 'select') onCanvasClick({ x: Math.round(mm.x / 10) * 10, y: Math.round(mm.y / 10) * 10 });
      }
      marqueeRef.current = null;
      setMarquee(null);
    }
    dragRef.current = null;
    dragSnappedRef.current = false;
    setSnapMarker(null);
  };

  const svgStyle = { '--u': mmPerPx } as CSSProperties;

  /** 글자 수로 어림한 라벨 상자(mm) — 한글 등 전각 글자는 한 글자 폭을, 영문·숫자는 그 절반 남짓을 차지한다고 본다 */
  const labelBox = (x: number, y: number, content: string, fontPx: number): Bounds => {
    let widthPx = 0;
    for (const ch of content) widthPx += ch.charCodeAt(0) > 0x2e7f ? fontPx : fontPx * 0.6;
    const halfW = px(widthPx / 2 + 2);
    const halfH = px(fontPx * 0.7);
    return { minX: x - halfW, maxX: x + halfW, minY: y - halfH, maxY: y + halfH };
  };
  // 이름 라벨(SP-1, C1 …)이 차지한 자리 — 선 길이 라벨은 이 자리와 서로를 피해 놓고, 놓을 곳이 없으면 생략한다
  const occupiedLabelBoxes: Bounds[] = [];

  // 헤드 캡션은 "SP-1 · R2.6M"처럼 이름과 반경을 함께 적되, 화면이 좁거나 축소돼 서로 겹치면 이름만, 그래도 겹치면 생략한다.
  // 선택한 헤드는 항상 전체를 보여준다.
  const headCaptions = new Map<string, string>();
  const heads = visibleShapes.filter((s): s is CircleShape => s.kind === 'circle' && s.sprinklerHead === true);
  const fullCaption = (head: CircleShape) => (head.label ? `${head.label} · R${formatMeters(head.radiusMm)}` : `R${formatMeters(head.radiusMm)}`);
  const captionBox = (head: CircleShape, caption: string) => labelBox(head.center.x, head.center.y - px(LABEL_GAP_PX), caption, 12);
  const fullBoxes = heads.map((head) => captionBox(head, fullCaption(head)));
  const fullFits = !fullBoxes.some((box, i) => fullBoxes.some((other, j) => j > i && boundsIntersect(box, other)));
  for (const head of heads) {
    const isSelected = selectedIds.includes(head.id);
    const caption = fullFits || isSelected ? fullCaption(head) : (head.label ?? '');
    if (!caption) continue;
    const box = captionBox(head, caption);
    if (!isSelected && occupiedLabelBoxes.some((other) => boundsIntersect(box, other))) continue;
    headCaptions.set(head.id, caption);
    occupiedLabelBoxes.push(box);
  }

  for (const shape of visibleShapes) {
    if (shape.kind === 'circle' && shape.sprinklerHead) {
      continue;
    } else if (shape.kind === 'circle' && shape.label) {
      occupiedLabelBoxes.push(labelBox(shape.center.x, shape.center.y - shape.radiusMm - px(LABEL_GAP_PX), shape.label, 12));
    } else if (shape.kind === 'rect' && shape.label) {
      occupiedLabelBoxes.push(labelBox(shape.center.x, shape.center.y - shape.heightMm / 2 - px(LABEL_GAP_PX), shape.label, 12));
    }
  }
  const dash = (on: number, off: number) => `${px(on)} ${px(off)}`;

  return (
    <div className="cad-canvas-wrap">
      <svg
        ref={svgRef}
        className={`cad-canvas ${spaceHeld ? 'cad-canvas-pan' : drawArmed || measureMode ? 'cad-canvas-draw-armed' : ''}`}
        style={svgStyle}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => { setDrawPreview(null); setMeasureHover(null); }}
      >
        <defs>
          <pattern id="grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
            <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="var(--border)" strokeWidth={px(1)} />
          </pattern>
        </defs>
        {/* 캔버스 영역의 가로세로 비율이 도면과 달라 생기는 여백까지 격자로 덮도록 viewBox보다 넉넉하게 깐다 */}
        <rect className="cad-grid-bg" x={centerX - gridSpan / 2} y={centerY - gridSpan / 2} width={gridSpan} height={gridSpan} fill="url(#grid)" />

        {/* 바탕 도면 — 격자 위, 모든 도형 아래 */}
        {underlay?.visible && (
          <image
            className="cad-underlay"
            href={underlay.imageUrl}
            x={underlay.origin.x}
            y={underlay.origin.y}
            width={underlay.widthPx * underlay.mmPerPx}
            height={underlay.heightPx * underlay.mmPerPx}
            preserveAspectRatio="none"
            opacity={underlay.opacity}
            style={{ filter: [underlay.enhance ? 'grayscale(1) contrast(1.35)' : '', underlay.invert ? 'invert(1)' : ''].filter(Boolean).join(' ') || undefined }}
            pointerEvents="none"
          />
        )}

        {/* 방호 검토: 어느 헤드의 방호범위에도 들지 않는 구역 */}
        {uncoveredRects.length > 0 && (
          <g className="cad-uncovered" pointerEvents="none">
            {uncoveredRects.map((r) => (
              <rect key={`${r.x}:${r.y}:${r.width}`} x={r.x} y={r.y} width={r.width} height={r.height} />
            ))}
          </g>
        )}

        {visibleShapes.map((shape) => {
          const color = layerMap.get(shape.layer)?.color ?? 'var(--text)';
          const isSelected = selectedIds.includes(shape.id);
          const outline = px(isSelected ? SELECTED_OUTLINE_PX : OUTLINE_PX);
          const stroke = isSelected ? 'var(--primary)' : color;
          // 그릴 레이어가 아닌 도형은 선택은 안 되지만, 구분을 위해 살짝 흐리게 표시
          const opacity = activeLayerId === ALL_LAYERS_ID || shape.layer === activeLayerId ? 1 : 0.5;

          if (shape.kind === 'line') {
            const strokeWidth = Math.max(shape.thicknessMm ?? DEFAULT_LINE_THICKNESS_MM, outline);
            const midX = (shape.start.x + shape.end.x) / 2;
            const midY = (shape.start.y + shape.end.y) / 2;
            const dx = shape.end.x - shape.start.x;
            const dy = shape.end.y - shape.start.y;
            const segLen = Math.hypot(dx, dy) || 1;
            const showDetail = segLen / mmPerPx >= MIN_LABELED_LINE_PX;
            const offset = strokeWidth / 2 + px(LINE_LABEL_GAP_PX);
            const lengthText = formatMeters(Math.abs(shape.lengthMm));
            // 선의 한쪽에 먼저 놓아 보고, 다른 라벨과 겹치면 반대쪽으로 옮긴다. 양쪽 다 겹치면 (선택한 선이 아닌 한) 생략한다.
            let labelPos: Point | null = null;
            if (showDetail) {
              for (const side of [1, -1]) {
                const candidate = { x: midX + (-dy / segLen) * offset * side, y: midY + (dx / segLen) * offset * side };
                const box = labelBox(candidate.x, candidate.y, lengthText, 11);
                if (!occupiedLabelBoxes.some((other) => boundsIntersect(box, other))) {
                  labelPos = candidate;
                  occupiedLabelBoxes.push(box);
                  break;
                }
              }
              if (!labelPos && isSelected) labelPos = { x: midX + (-dy / segLen) * offset, y: midY + (dx / segLen) * offset };
            }
            return (
              <g key={shape.id} opacity={opacity} pointerEvents="none">
                <line
                  x1={shape.start.x}
                  y1={shape.start.y}
                  x2={shape.end.x}
                  y2={shape.end.y}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
                {labelPos && (
                  <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="central" className="cad-dim-label">
                    {lengthText}
                  </text>
                )}
                {showDetail && [0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const p = lerpPoint(shape.start, shape.end, t);
                  return <circle key={t} cx={p.x} cy={p.y} r={px(GUIDE_DOT_PX)} className="cad-guide-dot" />;
                })}
              </g>
            );
          }

          if (shape.kind === 'rect') {
            const top = shape.center.y - shape.heightMm / 2;
            return (
              <g key={shape.id} opacity={opacity} pointerEvents="none">
                <rect
                  x={shape.center.x - shape.widthMm / 2}
                  y={top}
                  width={shape.widthMm}
                  height={shape.heightMm}
                  fill={color}
                  // 기둥은 속이 찬 물체라 진하게, 벽체로 그린 방은 안쪽(헤드·바탕 도면)이 보여야 하므로 아주 옅게 칠한다
                  fillOpacity={layerMap.get(shape.layer)?.category === 'column' ? 0.35 : 0.06}
                  stroke={stroke}
                  strokeWidth={outline}
                />
                {shape.label && (
                  <text x={shape.center.x} y={top - px(LABEL_GAP_PX)} textAnchor="middle" dominantBaseline="central" className="cad-label">
                    {shape.label}
                  </text>
                )}
                {(isSelected || !shape.label) && (
                  <text x={shape.center.x} y={top + shape.heightMm + px(LABEL_GAP_PX)} textAnchor="middle" dominantBaseline="central" className="cad-dim-label">
                    {formatMeters(shape.widthMm)} × {formatMeters(shape.heightMm)}
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
                    strokeWidth={px(OUTLINE_PX)}
                    strokeDasharray={dash(5, 4)}
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

          if (shape.kind === 'arc') {
            // 각도 규약(0°=오른쪽, 반시계 증가)에서 SVG의 sweep-flag=1은 시계 방향이므로, 반시계로 그리려면 sweep-flag=0을 쓴다.
            const startRad = (shape.startAngleDeg * Math.PI) / 180;
            const endRad = (shape.endAngleDeg * Math.PI) / 180;
            const startPt = { x: shape.center.x + shape.radiusMm * Math.cos(startRad), y: shape.center.y - shape.radiusMm * Math.sin(startRad) };
            const endPt = { x: shape.center.x + shape.radiusMm * Math.cos(endRad), y: shape.center.y - shape.radiusMm * Math.sin(endRad) };
            const sweepDeg = shape.endAngleDeg - shape.startAngleDeg;
            const largeArcFlag = sweepDeg > 180 ? 1 : 0;
            const d = `M ${startPt.x} ${startPt.y} A ${shape.radiusMm} ${shape.radiusMm} 0 ${largeArcFlag} 0 ${endPt.x} ${endPt.y}`;
            return (
              <g key={shape.id} opacity={opacity} pointerEvents="none">
                <path d={d} fill="none" stroke={stroke} strokeWidth={Math.max(DEFAULT_LINE_THICKNESS_MM, outline)} />
              </g>
            );
          }

          const category = layerMap.get(shape.layer)?.category;
          const coveragePolygon = shape.sprinklerHead
            ? computeSprinklerCoveragePolygon(shape.center, shape.radiusMm, sprinklerObstacles, shape.id)
            : null;
          const circleFillOpacity = category === 'column' ? 0.35 : 0.08;
          const dashArray = shape.sprinklerHead || category === 'sprinkler' ? dash(6, 4) : undefined;

          if (shape.sprinklerHead) {
            // 헤드 이름과 방호 반경을 한 줄로 묶어 헤드 바로 위에 붙인다 — 반경 표기를 원 둘레마다 따로 두면 서로 겹쳐 읽기 어렵다
            const caption = headCaptions.get(shape.id);
            return (
              <g key={shape.id} opacity={opacity} pointerEvents="none">
                <polygon
                  points={(coveragePolygon ?? []).map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={color}
                  fillOpacity={circleFillOpacity}
                  stroke={stroke}
                  strokeWidth={outline}
                  strokeLinejoin="round"
                  strokeDasharray={dashArray}
                />
                <circle cx={shape.center.x} cy={shape.center.y} r={px(3.5)} fill={isSelected ? 'var(--primary)' : color} />
                {caption && (
                  <text x={shape.center.x} y={shape.center.y - px(LABEL_GAP_PX)} textAnchor="middle" dominantBaseline="central" className={`cad-label ${isSelected ? 'cad-label-selected' : ''}`}>
                    {caption}
                  </text>
                )}
              </g>
            );
          }

          const radiusLabelPos = pointFromPolar(shape.center, shape.radiusMm + px(LABEL_GAP_PX + 4), 45);
          return (
            <g key={shape.id} opacity={opacity} pointerEvents="none">
              <circle
                cx={shape.center.x}
                cy={shape.center.y}
                r={shape.radiusMm}
                fill={color}
                fillOpacity={circleFillOpacity}
                stroke={stroke}
                strokeWidth={outline}
                strokeDasharray={dashArray}
              />
              {shape.label && (
                <text x={shape.center.x} y={shape.center.y - shape.radiusMm - px(LABEL_GAP_PX)} textAnchor="middle" dominantBaseline="central" className="cad-label">
                  {shape.label}
                </text>
              )}
              {(isSelected || !shape.label) && (
                <text x={radiusLabelPos.x} y={radiusLabelPos.y} textAnchor="start" dominantBaseline="central" className="cad-dim-label">
                  R{formatMeters(shape.radiusMm)}
                </text>
              )}
            </g>
          );
        })}

        {/* 다음 도형의 시작점/중심점 표시 (클릭으로 위치 변경 가능, 근처 꼭짓점에 자동 스냅) — 선택 도구에서는 숨긴다 */}
        {mode !== 'select' && (
          <g className="cad-pending" pointerEvents="none">
            <line x1={pendingPoint.x - px(13)} y1={pendingPoint.y} x2={pendingPoint.x + px(13)} y2={pendingPoint.y} />
            <line x1={pendingPoint.x} y1={pendingPoint.y - px(13)} x2={pendingPoint.x} y2={pendingPoint.y + px(13)} />
            <circle cx={pendingPoint.x} cy={pendingPoint.y} r={px(8)} strokeDasharray={dash(3, 2.5)} />
            <text x={pendingPoint.x + px(14)} y={pendingPoint.y - px(14)}>
              {mode === 'line' ? '시작점' : mode === 'text' ? '텍스트 위치' : drawPreviewKind === 'rect' ? '좌상단 시작점' : '중심점'}
            </text>
          </g>
        )}

        {/* 마우스로 그리기 무장 상태: 시작점/중심점에서 커서까지의 미리보기 도형 + 실시간 치수 */}
        {drawArmed && drawPreview && (() => {
          if (drawPreviewKind === 'line') {
            const midX = (pendingPoint.x + drawPreview.x) / 2;
            const midY = (pendingPoint.y + drawPreview.y) / 2;
            const { lengthMm, angleDeg } = lengthAndAngleBetween(pendingPoint, drawPreview);
            return (
              <g className="cad-draw-preview" pointerEvents="none">
                <line x1={pendingPoint.x} y1={pendingPoint.y} x2={drawPreview.x} y2={drawPreview.y} strokeDasharray={dash(6, 4)} />
                <text x={midX} y={midY - px(LABEL_GAP_PX + 2)} textAnchor="middle">
                  {formatMeters(lengthMm)} · {angleDeg}°
                </text>
              </g>
            );
          }
          if (drawPreviewKind === 'rect') {
            // pendingPoint(시작점)와 drawPreview(커서 지점)를 사각형의 마주보는 두 꼭짓점으로 삼는다
            const w = Math.abs(drawPreview.x - pendingPoint.x);
            const h = Math.abs(drawPreview.y - pendingPoint.y);
            const x = Math.min(pendingPoint.x, drawPreview.x);
            const y = Math.min(pendingPoint.y, drawPreview.y);
            return (
              <g className="cad-draw-preview" pointerEvents="none">
                <rect x={x} y={y} width={w} height={h} strokeDasharray={dash(6, 4)} />
                <text x={x + w / 2} y={y - px(LABEL_GAP_PX)} textAnchor="middle">
                  {formatMeters(w)} × {formatMeters(h)}
                </text>
              </g>
            );
          }
          const r = distanceMm(pendingPoint, drawPreview);
          return (
            <g className="cad-draw-preview" pointerEvents="none">
              <circle cx={pendingPoint.x} cy={pendingPoint.y} r={r} strokeDasharray={dash(6, 4)} />
              <text x={pendingPoint.x} y={pendingPoint.y - r - px(LABEL_GAP_PX)} textAnchor="middle">
                R{formatMeters(r)}
              </text>
            </g>
          );
        })()}

        {/* 거리 재기: A–B 선과 잰 거리 */}
        {measure && (() => {
          const end = measure.b ?? measureHover;
          const mark = (p: Point, key: string) => (
            <g key={key}>
              <line x1={p.x - px(7)} y1={p.y} x2={p.x + px(7)} y2={p.y} />
              <line x1={p.x} y1={p.y - px(7)} x2={p.x} y2={p.y + px(7)} />
            </g>
          );
          return (
            <g className="cad-measure" pointerEvents="none">
              {mark(measure.a, 'a')}
              {end && mark(end, 'b')}
              {end && <line x1={measure.a.x} y1={measure.a.y} x2={end.x} y2={end.y} strokeDasharray={measure.b ? undefined : dash(6, 4)} />}
              {end && (
                <text x={(measure.a.x + end.x) / 2} y={(measure.a.y + end.y) / 2 - px(LABEL_GAP_PX + 2)} textAnchor="middle" dominantBaseline="central">
                  {formatMeters(distanceMm(measure.a, end))}
                </text>
              )}
            </g>
          );
        })()}

        {/* 드래그 중 스냅된 꼭짓점 표시 */}
        {snapMarker && (
          <g className="cad-snap-marker" pointerEvents="none">
            <circle cx={snapMarker.x} cy={snapMarker.y} r={px(9)} />
            <line x1={snapMarker.x - px(13)} y1={snapMarker.y} x2={snapMarker.x + px(13)} y2={snapMarker.y} />
            <line x1={snapMarker.x} y1={snapMarker.y - px(13)} x2={snapMarker.x} y2={snapMarker.y + px(13)} />
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
            strokeDasharray={dash(5, 4)}
            pointerEvents="none"
          />
        )}
      </svg>

      {trimMode && <p className="cad-mode-hint">TR: 다른 도형과 만나는 구간을 클릭하면 그 부분만 잘려요 · Esc로 끝내기</p>}
      {measureMode && (
        <p className="cad-mode-hint">
          {measure?.b
            ? `잰 거리 ${formatMeters(distanceMm(measure.a, measure.b))} · 다시 찍으면 새로 재요`
            : measure ? '거리 재기: 끝점(B)을 찍으세요' : '거리 재기: 시작점(A)을 찍으세요'}
          {' · Esc로 끝내기'}
        </p>
      )}

      {selectedIds.length > 0 && (
        <button type="button" className="cad-delete-selected" onClick={onDeleteSelected} aria-label="선택한 도형 삭제">
          <IconTrash />
        </button>
      )}

      <div className="cad-quick-actions">
        <button type="button" className="cad-zoom-btn" onClick={onUndo} disabled={!canUndo} aria-label="실행 취소" title="실행 취소 (Ctrl+Z)">
          <IconUndo />
        </button>
        <button type="button" className="cad-zoom-btn" onClick={onRedo} disabled={!canRedo} aria-label="다시 실행" title="다시 실행 (Ctrl+Y)">
          <IconRedo />
        </button>
        <button type="button" className="cad-zoom-btn" onClick={handleResetPendingClick} aria-label="원점으로" title="시작점을 원점(0, 0)으로">
          <IconTarget />
        </button>
        <button
          type="button"
          className={`cad-zoom-btn ${trimMode ? 'cad-zoom-btn-active' : ''}`}
          onClick={() => {
            // TR과 거리 재기는 둘 다 클릭의 의미를 바꾸므로 한 번에 하나만 켠다
            if (!trimMode && measureMode) onToggleMeasure();
            setTrimMode((v) => !v);
            onSelect([]);
          }}
          aria-pressed={trimMode}
          aria-label="TR (겹치는 선 잘라내기)"
          title="TR: 겹치는 선 잘라내기"
        >
          <span className="cad-trim-label">Tr</span>
        </button>
        <button
          type="button"
          className={`cad-zoom-btn ${measureMode ? 'cad-zoom-btn-active' : ''}`}
          onClick={() => {
            if (!measureMode) setTrimMode(false);
            onToggleMeasure();
            onSelect([]);
          }}
          aria-pressed={measureMode}
          aria-label="거리 재기"
          title="거리 재기: 두 점 사이의 실제 거리"
        >
          <IconRuler />
        </button>
      </div>

      <div className="cad-zoom-controls">
        <button type="button" className="cad-zoom-btn" onClick={() => setZoom((z) => clamp(z / BUTTON_ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))} aria-label="축소" title="축소">
          <IconZoomOut />
        </button>
        <span className="cad-zoom-level">{Math.round(zoom * 100)}%</span>
        <button type="button" className="cad-zoom-btn" onClick={() => setZoom((z) => clamp(z * BUTTON_ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))} aria-label="확대" title="확대">
          <IconZoomIn />
        </button>
        <button
          type="button"
          className="cad-zoom-btn"
          onClick={() => {
            baseViewRef.current = computeBaseView(shapes, pendingPoint);
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="화면 맞춤"
          title="도면 전체가 보이게 맞춤"
        >
          <IconFit />
        </button>
      </div>
    </div>
  );
});

export default CadCanvas;
