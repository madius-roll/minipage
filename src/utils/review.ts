import type { CircleShape, Layer, LayerCategory, Point, Shape } from '../types/cad';
import { MIN_HEAD_SPACING_MM, MIN_HEAD_TO_WALL_MM, UNCOVERED_AREA_TOLERANCE_M2 } from '../data/reviewRules';
import {
  computeSprinklerCoveragePolygon,
  DEFAULT_LINE_THICKNESS_MM,
  distanceMm,
  distanceToSegment,
  formatMeters,
  getBounds,
  isAngleWithinArc,
  pointAngleDeg,
  rectToLineEdges,
} from './geometry';

export interface MmRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ReviewWarningKind = 'uncovered' | 'headSpacing' | 'headToWall' | 'headOutside';

export interface ReviewWarning {
  id: string;
  kind: ReviewWarningKind;
  message: string;
  /** 경고를 눌렀을 때 캔버스에서 선택해 보여줄 도형들 */
  shapeIds: string[];
}

export interface ReviewQuantities {
  headCount: number;
  columnCount: number;
  wallLengthMm: number;
  beamCount: number;
  beamLengthMm: number;
}

export interface ReviewResult {
  /** 벽체로 완전히 둘러싸인 공간(실)이 하나라도 있는지 — 없으면 면적·미방호 계산을 할 수 없다 */
  hasRoom: boolean;
  roomAreaM2: number;
  uncoveredAreaM2: number;
  /** 실 면적 중 헤드 방호범위에 들어간 비율(0~100) */
  coveragePct: number;
  /** 미방호 구역을 캔버스에 칠할 사각형들(mm) */
  uncoveredRects: MmRect[];
  warnings: ReviewWarning[];
  quantities: ReviewQuantities;
}

/** 격자 한 변에 들어가는 칸 수의 목표치 — 많을수록 정확하지만 드래그 중 다시 계산하는 비용이 커진다 */
const TARGET_CELLS_PER_SIDE = 200;
const MIN_CELL_MM = 20;
const MAX_CELL_MM = 500;
/** 벽 선을 격자에 칠할 때 벽 중심선 양쪽으로 더 칠하는 폭(칸 단위) — 대각선 방향으로도 새지 않으려면 0.71칸보다 커야 한다 */
const WALL_BAND_CELLS = 0.75;

interface Segment {
  a: Point;
  b: Point;
  halfThickness: number;
}

const roundTo = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

function headName(head: CircleShape): string {
  return head.label ?? `헤드(${Math.round(head.center.x)}, ${Math.round(head.center.y)})`;
}

/** 방사선 다각형(중심에서 일정 각도 간격으로 뻗은 점들) 안에 점이 들어 있는지 — 각도로 해당 방사선을 바로 찾아 비교한다 */
function isInsideStarPolygon(point: Point, center: Point, radii: number[]): boolean {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return true;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += Math.PI * 2;
  const pos = (angle / (Math.PI * 2)) * radii.length;
  const i = Math.floor(pos) % radii.length;
  const t = pos - Math.floor(pos);
  const limit = radii[i] * (1 - t) + radii[(i + 1) % radii.length] * t;
  return dist <= limit;
}

/**
 * 도면을 검토한다 — 벽체로 둘러싸인 실 안에서 어느 헤드의 방호범위에도 들지 않는 구역, 헤드 간격·벽 이격 경고, 수량 집계.
 * 숨긴 레이어도 도면의 일부이므로 표시 여부와 무관하게 전부 계산에 넣는다.
 */
export function computeReview(shapes: Shape[], layers: Layer[]): ReviewResult {
  const categoryOf = new Map<string, LayerCategory>(layers.map((l) => [l.id, l.category]));
  const wallShapes = shapes.filter((s) => categoryOf.get(s.layer) === 'wall');
  const columnShapes = shapes.filter((s) => categoryOf.get(s.layer) === 'column');
  const beamLines = shapes.filter((s) => categoryOf.get(s.layer) === 'beam' && s.kind === 'line');
  const heads = shapes.filter((s): s is CircleShape => s.kind === 'circle' && s.sprinklerHead === true);
  const obstacles = [...wallShapes, ...columnShapes];

  // 벽체를 선분 목록으로 펼친다 (사각형은 네 변으로). 원·호 벽은 둘레로 따로 다룬다.
  const wallSegments: Segment[] = [];
  let wallLengthMm = 0;
  for (const s of wallShapes) {
    if (s.kind === 'line') {
      wallSegments.push({ a: s.start, b: s.end, halfThickness: (s.thicknessMm ?? DEFAULT_LINE_THICKNESS_MM) / 2 });
      wallLengthMm += distanceMm(s.start, s.end);
    } else if (s.kind === 'rect') {
      for (const edge of rectToLineEdges(s)) wallSegments.push({ a: edge.start, b: edge.end, halfThickness: DEFAULT_LINE_THICKNESS_MM / 2 });
      wallLengthMm += (s.widthMm + s.heightMm) * 2;
    } else if (s.kind === 'circle') {
      wallLengthMm += 2 * Math.PI * s.radiusMm;
    } else if (s.kind === 'arc') {
      wallLengthMm += ((s.endAngleDeg - s.startAngleDeg) / 360) * 2 * Math.PI * s.radiusMm;
    }
  }
  const wallRims = wallShapes.filter((s) => s.kind === 'circle' || s.kind === 'arc');

  const quantities: ReviewQuantities = {
    headCount: heads.length,
    columnCount: columnShapes.filter((s) => s.kind === 'circle' || s.kind === 'rect').length,
    wallLengthMm: Math.round(wallLengthMm),
    beamCount: beamLines.length,
    beamLengthMm: Math.round(beamLines.reduce((sum, s) => sum + (s.kind === 'line' ? distanceMm(s.start, s.end) : 0), 0)),
  };

  const warnings: ReviewWarning[] = [];

  // 헤드 간격 — 모든 쌍을 비교한다
  for (let i = 0; i < heads.length; i++) {
    for (let j = i + 1; j < heads.length; j++) {
      const d = distanceMm(heads[i].center, heads[j].center);
      if (d < MIN_HEAD_SPACING_MM) {
        warnings.push({
          id: `spacing-${heads[i].id}-${heads[j].id}`,
          kind: 'headSpacing',
          message: `${headName(heads[i])} ↔ ${headName(heads[j])} 간격 ${formatMeters(d)} — ${formatMeters(MIN_HEAD_SPACING_MM)}보다 가까워요`,
          shapeIds: [heads[i].id, heads[j].id],
        });
      }
    }
  }

  // 헤드와 벽 사이 공간
  for (const head of heads) {
    let nearest = Infinity;
    for (const seg of wallSegments) nearest = Math.min(nearest, distanceToSegment(head.center, seg.a, seg.b) - seg.halfThickness);
    for (const rim of wallRims) {
      if (rim.kind !== 'circle' && rim.kind !== 'arc') continue;
      if (rim.kind === 'arc' && !isAngleWithinArc(pointAngleDeg(rim.center, head.center), rim.startAngleDeg, rim.endAngleDeg)) continue;
      nearest = Math.min(nearest, Math.abs(distanceMm(head.center, rim.center) - rim.radiusMm));
    }
    if (nearest < MIN_HEAD_TO_WALL_MM) {
      warnings.push({
        id: `wall-${head.id}`,
        kind: 'headToWall',
        message: `${headName(head)}이(가) 벽에 너무 가까워요 (${Math.max(0, Math.round(nearest))}mm, 기준 ${MIN_HEAD_TO_WALL_MM}mm 이상)`,
        shapeIds: [head.id],
      });
    }
  }

  const empty: ReviewResult = { hasRoom: false, roomAreaM2: 0, uncoveredAreaM2: 0, coveragePct: 0, uncoveredRects: [], warnings, quantities };
  if (wallShapes.length === 0) return empty;

  // ── 격자 만들기: 벽이 지나는 칸을 막고, 바깥 모서리에서 물을 부어(flood fill) 닿지 않는 칸을 "실 내부"로 본다 ──
  const bounds = getBounds(wallShapes);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  const cell = Math.min(MAX_CELL_MM, Math.max(MIN_CELL_MM, Math.ceil(span / TARGET_CELLS_PER_SIDE / 10) * 10));
  const margin = cell * 3;
  const originX = bounds.minX - margin;
  const originY = bounds.minY - margin;
  const cols = Math.ceil((bounds.maxX - bounds.minX + margin * 2) / cell);
  const rows = Math.ceil((bounds.maxY - bounds.minY + margin * 2) / cell);
  const centerOf = (col: number, row: number): Point => ({ x: originX + (col + 0.5) * cell, y: originY + (row + 0.5) * cell });
  const clampCol = (v: number) => Math.max(0, Math.min(cols - 1, v));
  const clampRow = (v: number) => Math.max(0, Math.min(rows - 1, v));

  const WALL = 1;
  const OUTSIDE = 2;
  const grid = new Uint8Array(cols * rows);

  for (const seg of wallSegments) {
    const band = seg.halfThickness + cell * WALL_BAND_CELLS;
    const c0 = clampCol(Math.floor((Math.min(seg.a.x, seg.b.x) - band - originX) / cell));
    const c1 = clampCol(Math.floor((Math.max(seg.a.x, seg.b.x) + band - originX) / cell));
    const r0 = clampRow(Math.floor((Math.min(seg.a.y, seg.b.y) - band - originY) / cell));
    const r1 = clampRow(Math.floor((Math.max(seg.a.y, seg.b.y) + band - originY) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (distanceToSegment(centerOf(c, r), seg.a, seg.b) <= band) grid[r * cols + c] = WALL;
      }
    }
  }
  for (const rim of wallRims) {
    if (rim.kind !== 'circle' && rim.kind !== 'arc') continue;
    const band = DEFAULT_LINE_THICKNESS_MM / 2 + cell * WALL_BAND_CELLS;
    const c0 = clampCol(Math.floor((rim.center.x - rim.radiusMm - band - originX) / cell));
    const c1 = clampCol(Math.floor((rim.center.x + rim.radiusMm + band - originX) / cell));
    const r0 = clampRow(Math.floor((rim.center.y - rim.radiusMm - band - originY) / cell));
    const r1 = clampRow(Math.floor((rim.center.y + rim.radiusMm + band - originY) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const p = centerOf(c, r);
        if (Math.abs(distanceMm(p, rim.center) - rim.radiusMm) > band) continue;
        if (rim.kind === 'arc' && !isAngleWithinArc(pointAngleDeg(rim.center, p), rim.startAngleDeg, rim.endAngleDeg)) continue;
        grid[r * cols + c] = WALL;
      }
    }
  }

  // 격자 가장자리(여백)는 항상 벽 바깥이므로 (0,0)에서 시작해 상하좌우로 번져 나간다
  const stack: number[] = [0];
  grid[0] = OUTSIDE;
  while (stack.length > 0) {
    const idx = stack.pop() as number;
    const c = idx % cols;
    const r = (idx - c) / cols;
    if (c > 0 && grid[idx - 1] === 0) { grid[idx - 1] = OUTSIDE; stack.push(idx - 1); }
    if (c < cols - 1 && grid[idx + 1] === 0) { grid[idx + 1] = OUTSIDE; stack.push(idx + 1); }
    if (r > 0 && grid[idx - cols] === 0) { grid[idx - cols] = OUTSIDE; stack.push(idx - cols); }
    if (r < rows - 1 && grid[idx + cols] === 0) { grid[idx + cols] = OUTSIDE; stack.push(idx + cols); }
  }

  // 헤드별 방호범위(장애물에 잘린 방사선 다각형)를 캔버스와 같은 계산으로 구해 둔다
  const coverages = heads.map((head) => {
    const polygon = computeSprinklerCoveragePolygon(head.center, head.radiusMm, obstacles, head.id);
    return { head, radii: polygon.map((p) => distanceMm(head.center, p)) };
  });

  const isInsideColumn = (p: Point): boolean => columnShapes.some((s) => {
    if (s.kind === 'circle') return distanceMm(p, s.center) <= s.radiusMm;
    if (s.kind === 'rect') return Math.abs(p.x - s.center.x) <= s.widthMm / 2 && Math.abs(p.y - s.center.y) <= s.heightMm / 2;
    return false;
  });

  // 벽으로 칠한 띠의 안쪽 절반은 실제로는 실 바닥이다 — 바깥 칸에서 띠 폭보다 멀리 떨어진 벽 칸을 안쪽으로 보고 면적에 넣는다
  // (넣지 않으면 벽 둘레 × 띠 폭만큼 면적이 작게 나온다). 벽에 바짝 붙은 칸이라 방호 여부는 따로 따지지 않는다.
  const bandReach = DEFAULT_LINE_THICKNESS_MM / 2 + cell * WALL_BAND_CELLS;
  const reachCells = Math.ceil(bandReach / cell) + 1;
  let innerWallCells = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c] !== WALL) continue;
      let nearOutside = false;
      for (let dr = -reachCells; dr <= reachCells && !nearOutside; dr++) {
        for (let dc = -reachCells; dc <= reachCells; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || grid[rr * cols + cc] !== OUTSIDE) continue;
          if (Math.hypot(dr, dc) * cell <= bandReach + cell / 2) {
            nearOutside = true;
            break;
          }
        }
      }
      if (!nearOutside) innerWallCells++;
    }
  }

  let roomCells = innerWallCells;
  let uncoveredCells = 0;
  const uncovered = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c] !== 0) continue;
      const p = centerOf(c, r);
      roomCells++;
      // 기둥이 차지한 자리는 바닥 면적에는 들어가지만 물이 닿을 필요는 없다
      if (isInsideColumn(p)) continue;
      const covered = coverages.some(({ head, radii }) => (
        Math.abs(p.x - head.center.x) <= head.radiusMm && Math.abs(p.y - head.center.y) <= head.radiusMm && isInsideStarPolygon(p, head.center, radii)
      ));
      if (!covered) {
        uncovered[r * cols + c] = 1;
        uncoveredCells++;
      }
    }
  }

  if (roomCells === innerWallCells) return empty;

  // 실 밖(또는 벽 위)에 놓인 헤드
  for (const head of heads) {
    const c = Math.floor((head.center.x - originX) / cell);
    const r = Math.floor((head.center.y - originY) / cell);
    const inGrid = c >= 0 && c < cols && r >= 0 && r < rows;
    if (!inGrid || grid[r * cols + c] === OUTSIDE) {
      warnings.push({ id: `outside-${head.id}`, kind: 'headOutside', message: `${headName(head)}이(가) 벽체로 둘러싸인 공간 밖에 있어요`, shapeIds: [head.id] });
    }
  }

  // 미방호 칸을 가로로 이어 붙이고, 위아래로 폭이 같은 줄끼리 다시 합쳐 사각형 수를 줄인다
  const uncoveredRects: MmRect[] = [];
  const open = new Map<string, MmRect>();
  for (let r = 0; r < rows; r++) {
    const stillOpen = new Map<string, MmRect>();
    let c = 0;
    while (c < cols) {
      if (!uncovered[r * cols + c]) { c++; continue; }
      const start = c;
      while (c < cols && uncovered[r * cols + c]) c++;
      const key = `${start}:${c}`;
      const above = open.get(key);
      if (above) {
        above.height += cell;
        stillOpen.set(key, above);
      } else {
        const rect = { x: originX + start * cell, y: originY + r * cell, width: (c - start) * cell, height: cell };
        uncoveredRects.push(rect);
        stillOpen.set(key, rect);
      }
    }
    open.clear();
    stillOpen.forEach((rect, key) => open.set(key, rect));
  }

  const cellAreaM2 = (cell * cell) / 1_000_000;
  const roomAreaM2 = roundTo(roomCells * cellAreaM2, 1);
  const uncoveredAreaM2 = roundTo(uncoveredCells * cellAreaM2, 2);
  const hasUncovered = uncoveredAreaM2 > UNCOVERED_AREA_TOLERANCE_M2;
  if (hasUncovered) {
    warnings.unshift({
      id: 'uncovered',
      kind: 'uncovered',
      message: heads.length === 0 ? '헤드가 없어 실 전체가 미방호 상태예요' : `어느 헤드도 닿지 않는 미방호 구역이 약 ${uncoveredAreaM2}㎡ 있어요`,
      shapeIds: [],
    });
  }

  return {
    hasRoom: true,
    roomAreaM2,
    uncoveredAreaM2: hasUncovered ? uncoveredAreaM2 : 0,
    coveragePct: roundTo(((roomCells - (hasUncovered ? uncoveredCells : 0)) / roomCells) * 100, 1),
    uncoveredRects: hasUncovered ? uncoveredRects : [],
    warnings,
    quantities,
  };
}
