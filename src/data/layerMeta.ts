import type { LayerCategory } from '../types/cad';

export const CATEGORY_LABELS: Record<LayerCategory, string> = {
  wall: '벽체',
  beam: '보',
  column: '기둥',
  sprinkler: '스프링클러',
  etc: '기타',
};

export const CATEGORY_OPTIONS: LayerCategory[] = ['wall', 'beam', 'column', 'sprinkler', 'etc'];

/** 새 레이어 생성 시 순서대로 배정되는 색상. 색상 변경 기능은 제공하지 않는다. */
export const LAYER_COLOR_PALETTE = [
  '#B3B3B3',
  '#FFB020',
  '#4FA8FF',
  '#1DB954',
  '#FF6B6B',
  '#C77DFF',
];

export const MAX_LAYERS = 6;

/** "그릴 레이어" 드롭다운의 특수 값 — 모든 레이어의 도형을 선택·삭제·수정할 수 있게 한다 (그리기 대상은 될 수 없음) */
export const ALL_LAYERS_ID = '__all__';

export const DEFAULT_BEAM_THICKNESS_MM = 300;
