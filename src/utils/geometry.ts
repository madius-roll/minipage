import type { Point, Shape } from '../types/cad';

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
