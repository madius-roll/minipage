export type Point = { x: number; y: number };

/** 레이어 용도 — 이름은 자유롭게 바꿀 수 있지만 용도는 생성 시 고정된다 */
export type LayerCategory = 'wall' | 'beam' | 'column' | 'sprinkler' | 'etc';

export interface Layer {
  id: string;
  name: string;
  category: LayerCategory;
  color: string;
  visible: boolean;
}

interface BaseShape {
  id: string;
  layer: string;
}

export interface LineShape extends BaseShape {
  kind: 'line';
  start: Point;
  end: Point;
  lengthMm: number;
  angleDeg: number;
  /** 보(Beam) 등 두께가 있는 선에 사용 */
  thicknessMm?: number;
}

export interface CircleShape extends BaseShape {
  kind: 'circle';
  center: Point;
  radiusMm: number;
  label?: string;
}

export interface RectShape extends BaseShape {
  kind: 'rect';
  center: Point;
  widthMm: number;
  heightMm: number;
  label?: string;
}

export interface TextShape extends BaseShape {
  kind: 'text';
  position: Point;
  text: string;
}

export type Shape = LineShape | CircleShape | RectShape | TextShape;
