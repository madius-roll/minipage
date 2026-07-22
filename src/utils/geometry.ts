import type { LineShape, Point, Shape } from '../types/cad';

/**
 * 시작점 기준 길이(mm)와 각도(도, 0°=오른쪽·반시계 방향 증가)로
 * 도착점을 계산한다. 정밀 선 그리기 기능의 핵심 유틸.
 */
export function pointFromPolar(start: Point, lengthMm: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    // mm 정밀도로 반올림해 삼각함수 부동소수점 오차(예: 1950.0000000000002)를 제거한다.
    x: Math.round(start.x + lengthMm * Math.cos(rad)),
    y: Math.round(start.y - lengthMm * Math.sin(rad)),
  };
}

export function distanceMm(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** a와 b 사이를 t(0~1) 비율로 보간한 점 */
export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 원 둘레 위에서 point에 가장 가까운 점 */
export function nearestPointOnCircle(point: Point, center: Point, radius: number): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dist = Math.hypot(dx, dy) || 1;
  return { x: center.x + (dx / dist) * radius, y: center.y + (dy / dist) * radius };
}

/** 점 p에서 선분 a-b까지의 최단 거리 (mm) — 캔버스 히트테스트에 사용 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 텍스트 박스 도형의 글꼴 크기(mm) — 다른 캔버스 라벨과 동일한 크기를 쓴다 */
export const TEXT_FONT_SIZE_MM = 220;
const TEXT_CHAR_WIDTH_RATIO = 0.58;

/** DOM 측정 없이 텍스트 내용으로부터 대략적인 박스 크기(mm)를 추정한다 (경계/히트테스트 공용) */
export function estimateTextBoxMm(text: string): { width: number; height: number } {
  return {
    width: Math.max(text.length, 1) * TEXT_FONT_SIZE_MM * TEXT_CHAR_WIDTH_RATIO,
    height: TEXT_FONT_SIZE_MM * 1.3,
  };
}

/** 단일 도형의 mm 단위 바운딩 박스 */
export function getShapeBounds(shape: Shape): Bounds {
  if (shape.kind === 'line') {
    return {
      minX: Math.min(shape.start.x, shape.end.x),
      maxX: Math.max(shape.start.x, shape.end.x),
      minY: Math.min(shape.start.y, shape.end.y),
      maxY: Math.max(shape.start.y, shape.end.y),
    };
  }
  if (shape.kind === 'circle') {
    return {
      minX: shape.center.x - shape.radiusMm,
      maxX: shape.center.x + shape.radiusMm,
      minY: shape.center.y - shape.radiusMm,
      maxY: shape.center.y + shape.radiusMm,
    };
  }
  if (shape.kind === 'text') {
    const { width, height } = estimateTextBoxMm(shape.text);
    return {
      minX: shape.position.x - width / 2,
      maxX: shape.position.x + width / 2,
      minY: shape.position.y - height / 2,
      maxY: shape.position.y + height / 2,
    };
  }
  return {
    minX: shape.center.x - shape.widthMm / 2,
    maxX: shape.center.x + shape.widthMm / 2,
    minY: shape.center.y - shape.heightMm / 2,
    maxY: shape.center.y + shape.heightMm / 2,
  };
}

/** 도형 목록을 모두 포함하는 mm 단위 바운딩 박스를 계산한다 (캔버스 viewBox 산출용). */
export function getBounds(shapes: Shape[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const shape of shapes) {
    const b = getShapeBounds(shape);
    minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY);
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  return { minX, minY, maxX, maxY };
}

/** 두 바운딩 박스가 겹치는지 여부 (마퀴/드래그 선택에 사용) */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** 도형을 (dx, dy) mm 만큼 평행이동한 복사본을 반환한다. 이동/붙여넣기 공용. */
export function translateShape<T extends Shape>(shape: T, dx: number, dy: number): T {
  if (shape.kind === 'line') {
    return {
      ...shape,
      start: { x: shape.start.x + dx, y: shape.start.y + dy },
      end: { x: shape.end.x + dx, y: shape.end.y + dy },
    };
  }
  if (shape.kind === 'text') {
    return {
      ...shape,
      position: { x: shape.position.x + dx, y: shape.position.y + dy },
    };
  }
  return {
    ...shape,
    center: { x: shape.center.x + dx, y: shape.center.y + dy },
  };
}

/** 스냅 대상이 되는 도형의 대표 꼭짓점(선은 양 끝점, 원·사각형은 중심, 텍스트는 위치) */
export function getShapeVertices(shape: Shape): Point[] {
  if (shape.kind === 'line') return [shape.start, shape.end];
  if (shape.kind === 'text') return [shape.position];
  return [shape.center];
}

/** candidates 중 point와 tolerance(mm) 이내로 가장 가까운 점을 반환 (CAD 스냅) */
export function findNearestVertex(point: Point, candidates: Point[], toleranceMm: number): Point | null {
  let best: Point | null = null;
  let bestDist = toleranceMm;
  for (const c of candidates) {
    const d = Math.hypot(c.x - point.x, c.y - point.y);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** mm 값을 "M" 단위 표기 문자열로 변환 (소수점 둘째 자리까지, 끝의 0은 생략) */
export function formatMeters(mm: number): string {
  const m = Math.round((mm / 1000) * 100) / 100;
  return `${m}M`;
}

let idCounter = 0;
/** 짧고 충돌 없는 도형/레이어 id 생성 */
export function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 두 선분(a1-a2, b1-b2)의 교차점. 끝점 포함, 평행/겹침은 교차점이 무한하므로 무시(null)한다. */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** 선분과 원 둘레의 교차점 (0~2개) */
export function segmentCircleIntersections(a: Point, b: Point, center: Point, radius: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - center.x;
  const fy = a.y - center.y;
  const A = dx * dx + dy * dy;
  if (A === 0) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const sqrtDisc = Math.sqrt(disc);
  const pts: Point[] = [];
  for (const t of [(-B - sqrtDisc) / (2 * A), (-B + sqrtDisc) / (2 * A)]) {
    if (t >= 0 && t <= 1) pts.push({ x: a.x + t * dx, y: a.y + t * dy });
  }
  return pts;
}

/** 선분과 축정렬 사각형(중심+가로/세로) 네 변의 교차점 */
export function segmentRectIntersections(a: Point, b: Point, center: Point, widthMm: number, heightMm: number): Point[] {
  const hw = widthMm / 2;
  const hh = heightMm / 2;
  const corners: Point[] = [
    { x: center.x - hw, y: center.y - hh },
    { x: center.x + hw, y: center.y - hh },
    { x: center.x + hw, y: center.y + hh },
    { x: center.x - hw, y: center.y + hh },
  ];
  const pts: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const p = segmentIntersection(a, b, corners[i], corners[(i + 1) % 4]);
    if (p) pts.push(p);
  }
  return pts;
}

/** line이 다른 도형들과 교차하는 지점들을 line.start~end 기준 매개변수 t(0~1)로, 0과 1을 포함해 오름차순 반환 */
export function getLineCutParams(line: LineShape, others: Shape[]): number[] {
  const { start, end } = line;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  const toT = (p: Point) => (lenSq === 0 ? 0 : ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq);

  const ts = new Set<number>([0, 1]);
  for (const other of others) {
    if (other.id === line.id) continue;
    if (other.kind === 'line') {
      const p = segmentIntersection(start, end, other.start, other.end);
      if (p) ts.add(clamp01(toT(p)));
    } else if (other.kind === 'circle') {
      for (const p of segmentCircleIntersections(start, end, other.center, other.radiusMm)) ts.add(clamp01(toT(p)));
    } else if (other.kind === 'rect') {
      for (const p of segmentRectIntersections(start, end, other.center, other.widthMm, other.heightMm)) ts.add(clamp01(toT(p)));
    }
  }
  return Array.from(ts).sort((x, y) => x - y);
}

function buildLinePiece(original: LineShape, s: Point, e: Point): LineShape {
  const lengthMm = Math.round(distanceMm(s, e));
  const angleDeg = Math.round((Math.atan2(-(e.y - s.y), e.x - s.x) * 180) / Math.PI * 100) / 100;
  return { ...original, id: genId('line'), start: s, end: e, lengthMm, angleDeg };
}

export interface TrimResult {
  removedId: string;
  kept: LineShape[];
}

/** 최소 조각 길이(mm) — 이보다 짧게 남는 조각은 버린다(부동소수점 오차로 생기는 0에 가까운 조각 방지) */
const TRIM_MIN_PIECE_MM = 10;

/**
 * clickPoint 근처의 line을, 다른 도형들과의 교차 지점을 기준으로 트림한다.
 * 클릭 지점을 감싸는 두 교차 지점 사이의 구간만 제거하고 나머지는 그대로 둔다.
 * 교차점이 없거나(자를 게 없음) 클릭 지점이 교차점과 거의 겹치면 null을 반환한다.
 */
export function trimLineAtPoint(line: LineShape, clickPoint: Point, others: Shape[]): TrimResult | null {
  const ts = getLineCutParams(line, others);
  if (ts.length <= 2) return null;

  const { start, end } = line;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  const tClick = lenSq === 0 ? 0 : clamp01(((clickPoint.x - start.x) * dx + (clickPoint.y - start.y) * dy) / lenSq);

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < ts.length - 1; i++) {
    if (tClick >= ts[i] && tClick <= ts[i + 1]) {
      lo = ts[i];
      hi = ts[i + 1];
      break;
    }
  }
  if (hi - lo < 1e-6) return null;

  const kept: LineShape[] = [];
  if (lo > 0) {
    const segEnd = lerpPoint(start, end, lo);
    if (distanceMm(start, segEnd) >= TRIM_MIN_PIECE_MM) kept.push(buildLinePiece(line, start, segEnd));
  }
  if (hi < 1) {
    const segStart = lerpPoint(start, end, hi);
    if (distanceMm(segStart, end) >= TRIM_MIN_PIECE_MM) kept.push(buildLinePiece(line, segStart, end));
  }
  return { removedId: line.id, kept };
}
