import type { Layer, Shape, Point } from '../types/cad';
import { pointFromPolar } from '../utils/geometry';
import { DEFAULT_BEAM_THICKNESS_MM, LAYER_COLOR_PALETTE } from './layerMeta';

export const LAYER_WALL = 'layer-wall';
export const LAYER_BEAM = 'layer-beam';
export const LAYER_COLUMN = 'layer-column';
export const LAYER_SPRINKLER = 'layer-sprinkler';

/**
 * 8000mm x 6000mm 방을 "연속 그리기"(길이+각도) 방식으로 작성한 더미 도면.
 * 실제 사용자가 ToolPanel에서 입력하는 흐름과 동일한 계산식(pointFromPolar)을 사용한다.
 */
function buildWallLoop(): { start: Point; end: Point; lengthMm: number; angleDeg: number }[] {
  const p0: Point = { x: 0, y: 0 };
  const steps = [
    { lengthMm: 8000, angleDeg: 0 },
    { lengthMm: 6000, angleDeg: -90 },
    { lengthMm: 8000, angleDeg: 180 },
    { lengthMm: 6000, angleDeg: 90 },
  ];
  let cursor = p0;
  return steps.map((s) => {
    const end = pointFromPolar(cursor, s.lengthMm, s.angleDeg);
    const seg = { start: cursor, end, lengthMm: s.lengthMm, angleDeg: s.angleDeg };
    cursor = end;
    return seg;
  });
}

const wallSegments = buildWallLoop();

export const dummyShapes: Shape[] = [
  ...wallSegments.map((seg, i) => ({
    id: `wall-${i}`,
    layer: LAYER_WALL,
    kind: 'line' as const,
    ...seg,
  })),
  // 보 (Beam) — 두께 있는 선
  { id: 'beam-0', layer: LAYER_BEAM, kind: 'line', start: { x: 0, y: 2000 }, end: { x: 8000, y: 2000 }, lengthMm: 8000, angleDeg: 0, thicknessMm: DEFAULT_BEAM_THICKNESS_MM },
  { id: 'beam-1', layer: LAYER_BEAM, kind: 'line', start: { x: 0, y: 4000 }, end: { x: 8000, y: 4000 }, lengthMm: 8000, angleDeg: 0, thicknessMm: DEFAULT_BEAM_THICKNESS_MM },
  // 기둥 (Column) — 원형 2개 + 사각형 2개 (두 모양 다 지원함을 보여주는 예시)
  { id: 'col-0', layer: LAYER_COLUMN, kind: 'circle', center: { x: 300, y: 300 }, radiusMm: 200, label: 'C1' },
  { id: 'col-1', layer: LAYER_COLUMN, kind: 'rect', center: { x: 7700, y: 300 }, widthMm: 400, heightMm: 400, label: 'C2' },
  { id: 'col-2', layer: LAYER_COLUMN, kind: 'circle', center: { x: 300, y: 5700 }, radiusMm: 200, label: 'C3' },
  { id: 'col-3', layer: LAYER_COLUMN, kind: 'rect', center: { x: 7700, y: 5700 }, widthMm: 400, heightMm: 400, label: 'C4' },
  // 스프링클러 헤드 및 살수반경
  { id: 'sp-0', layer: LAYER_SPRINKLER, kind: 'circle', center: { x: 2000, y: 1500 }, radiusMm: 2600, label: 'SP-1' },
  { id: 'sp-1', layer: LAYER_SPRINKLER, kind: 'circle', center: { x: 4000, y: 1500 }, radiusMm: 2600, label: 'SP-2' },
  { id: 'sp-2', layer: LAYER_SPRINKLER, kind: 'circle', center: { x: 6000, y: 1500 }, radiusMm: 2600, label: 'SP-3' },
  { id: 'sp-3', layer: LAYER_SPRINKLER, kind: 'circle', center: { x: 2000, y: 4500 }, radiusMm: 2600, label: 'SP-4' },
  { id: 'sp-4', layer: LAYER_SPRINKLER, kind: 'circle', center: { x: 4000, y: 4500 }, radiusMm: 2600, label: 'SP-5' },
  { id: 'sp-5', layer: LAYER_SPRINKLER, kind: 'circle', center: { x: 6000, y: 4500 }, radiusMm: 2600, label: 'SP-6' },
];

export const dummyLayers: Layer[] = [
  { id: LAYER_WALL, name: '벽체', category: 'wall', visible: true, color: LAYER_COLOR_PALETTE[0] },
  { id: LAYER_BEAM, name: '보', category: 'beam', visible: true, color: LAYER_COLOR_PALETTE[1] },
  { id: LAYER_COLUMN, name: '기둥', category: 'column', visible: true, color: LAYER_COLOR_PALETTE[2] },
  { id: LAYER_SPRINKLER, name: '스프링클러', category: 'sprinkler', visible: true, color: LAYER_COLOR_PALETTE[3] },
];
