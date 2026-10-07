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
  /** SP헤드반경(스프링클러 방호범위) 도구로 그린 원 — 벽체/기둥 장애물에 가려진 만큼 반경이 잘려서 그려진다 */
  sprinklerHead?: boolean;
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

/** TR로 원을 트림하면 남는 호(弧) — 다른 각도 표기와 동일하게 0°=오른쪽, 반시계 방향 증가. endAngleDeg > startAngleDeg이며 360을 넘을 수 있다(둘레를 넘지 않는 범위 안에서) */
export interface ArcShape extends BaseShape {
  kind: 'arc';
  center: Point;
  radiusMm: number;
  startAngleDeg: number;
  endAngleDeg: number;
}

export type Shape = LineShape | CircleShape | RectShape | TextShape | ArcShape;

/**
 * 바탕 도면 — 사진·이미지·PDF를 캔버스 바닥에 깔아 두고 그 위에 그린다.
 * 원근 보정을 마친 이미지 한 장과, 그 이미지를 도면 좌표(mm)에 어떻게 놓을지(위치·축척)를 담는다.
 */
export interface Underlay {
  /** 화면에 그릴 때 쓰는 임시 주소(object URL) — 저장할 때는 blob을 따로 보관한다 */
  imageUrl: string;
  blob: Blob;
  widthPx: number;
  heightPx: number;
  /** 이미지 좌상단이 놓이는 도면 좌표(mm) */
  origin: Point;
  /** 이미지 1px이 실제로 몇 mm인지 (축척 맞춤의 결과) */
  mmPerPx: number;
  /** 종이 위 크기를 아는 경우(PDF, 용지 크기를 지정한 사진)에만 — 이미지 1px이 종이에서 몇 mm인지. 있으면 "1:N" 축척 입력을 쓸 수 있다 */
  paperMmPerPx?: number;
  opacity: number;
  /** 흰 종이를 어두운 캔버스에 맞게 반전해 보여준다 */
  invert: boolean;
  /** 흑백으로 바꾸고 대비를 올려 그림자·누런 종이색을 걷어낸다 */
  enhance: boolean;
  visible: boolean;
}
