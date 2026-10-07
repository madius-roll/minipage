import { useState, type KeyboardEvent } from 'react';
import type { ArcShape, CircleShape, LineShape, RectShape, Shape, TextShape } from '../../types/cad';
import { IconClipboard, IconCopy, IconTrash } from '../ui/Icon';
import './panels.css';
import './PropertyPanel.css';

interface PropertyPanelProps {
  selectedShapes: Shape[];
  onUpdateLine: (id: string, lengthMm: number, angleDeg: number, thicknessMm?: number) => void;
  onUpdateCircle: (id: string, radiusMm: number) => void;
  onUpdateRect: (id: string, widthMm: number, heightMm: number) => void;
  onUpdateText: (id: string, text: string) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onDeleteSelected: () => void;
  onCopySelected: () => void;
  onPasteShape: () => void;
  hasClipboard: boolean;
}

/** 하단: 선택된 객체(들)의 속성 표시·수정 + 복사/붙여넣기/삭제 */
export default function PropertyPanel({
  selectedShapes,
  onUpdateLine,
  onUpdateCircle,
  onUpdateRect,
  onUpdateText,
  onUpdateLabel,
  onDeleteSelected,
  onCopySelected,
  onPasteShape,
  hasClipboard,
}: PropertyPanelProps) {
  const single = selectedShapes.length === 1 ? selectedShapes[0] : null;

  return (
    <section className="panel property-panel">
      <div className="property-header">
        <h2 className="panel-title">
          {single ? '선택한 객체' : `${selectedShapes.length}개 선택됨`}
        </h2>
        <div className="property-actions">
          <button type="button" className="property-action-btn" onClick={onCopySelected} aria-label="복사">
            <IconCopy />
          </button>
          <button type="button" className="property-action-btn" onClick={onPasteShape} disabled={!hasClipboard} aria-label="붙여넣기">
            <IconClipboard />
          </button>
          <button type="button" className="property-action-btn property-action-danger" onClick={onDeleteSelected} aria-label="삭제">
            <IconTrash />
          </button>
        </div>
      </div>

      {single ? (
        single.kind === 'line' ? (
          <LineFields key={single.id} shape={single} onUpdateLine={onUpdateLine} />
        ) : single.kind === 'circle' ? (
          <CircleFields key={single.id} shape={single} onUpdateCircle={onUpdateCircle} onUpdateLabel={onUpdateLabel} />
        ) : single.kind === 'rect' ? (
          <RectFields key={single.id} shape={single} onUpdateRect={onUpdateRect} onUpdateLabel={onUpdateLabel} />
        ) : single.kind === 'arc' ? (
          <ArcFields key={single.id} shape={single} />
        ) : (
          <TextFields key={single.id} shape={single} onUpdateText={onUpdateText} />
        )
      ) : (
        <p className="property-empty-text">
          도형 {selectedShapes.length}개가 선택되었습니다. 드래그하면 함께 이동하고, 복사·삭제도 한번에 적용됩니다. 속성 수정은 하나만 선택했을 때 가능해요.
        </p>
      )}
    </section>
  );
}

function commitOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur();
}

function LineFields({ shape, onUpdateLine }: { shape: LineShape; onUpdateLine: PropertyPanelProps['onUpdateLine'] }) {
  const [length, setLength] = useState(String(shape.lengthMm));
  const [angle, setAngle] = useState(String(shape.angleDeg));
  const [thickness, setThickness] = useState(String(shape.thicknessMm ?? ''));
  const hasThickness = shape.thicknessMm !== undefined;

  const commit = () => {
    const l = parseFloat(length);
    const a = parseFloat(angle);
    const t = parseFloat(thickness);
    if (!Number.isFinite(l) || l === 0 || !Number.isFinite(a)) return;
    onUpdateLine(shape.id, l, a, hasThickness && Number.isFinite(t) && t > 0 ? t : undefined);
  };

  return (
    <div className="property-grid">
      <div className="field">
        <label>시작점</label>
        <span className="property-static">({shape.start.x}, {shape.start.y}) mm</span>
      </div>
      <div className="field">
        <label htmlFor="edit-length">길이 (mm)</label>
        <input id="edit-length" type="number" value={length} onChange={(e) => setLength(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} />
      </div>
      <div className="field">
        <label htmlFor="edit-angle">각도 (°)</label>
        <input id="edit-angle" type="number" value={angle} onChange={(e) => setAngle(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} />
      </div>
      {hasThickness && (
        <div className="field">
          <label htmlFor="edit-thickness">두께 (mm)</label>
          <input id="edit-thickness" type="number" min="1" value={thickness} onChange={(e) => setThickness(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} />
        </div>
      )}
    </div>
  );
}

/** 원·사각형에 붙는 이름표(SP-1, C1 등) — 비워 두면 라벨 없이 그려진다 */
function LabelField({ shape, onUpdateLabel }: { shape: CircleShape | RectShape; onUpdateLabel: PropertyPanelProps['onUpdateLabel'] }) {
  const [label, setLabel] = useState(shape.label ?? '');
  return (
    <div className="field">
      <label htmlFor="edit-label">라벨</label>
      <input
        id="edit-label"
        type="text"
        maxLength={12}
        placeholder="없음"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => onUpdateLabel(shape.id, label)}
        onKeyDown={commitOnEnter}
      />
    </div>
  );
}

function CircleFields({ shape, onUpdateCircle, onUpdateLabel }: { shape: CircleShape; onUpdateCircle: PropertyPanelProps['onUpdateCircle']; onUpdateLabel: PropertyPanelProps['onUpdateLabel'] }) {
  const [radius, setRadius] = useState(String(shape.radiusMm));

  const commit = () => {
    const r = parseFloat(radius);
    if (!Number.isFinite(r) || r <= 0) return;
    onUpdateCircle(shape.id, r);
  };

  return (
    <div className="property-grid">
      <div className="field">
        <label>중심</label>
        <span className="property-static">({shape.center.x}, {shape.center.y}) mm</span>
      </div>
      <div className="field">
        <label htmlFor="edit-radius">{shape.sprinklerHead ? '방호 반경 (mm)' : '반지름 (mm)'}</label>
        <input id="edit-radius" type="number" min="1" value={radius} onChange={(e) => setRadius(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} />
      </div>
      <LabelField shape={shape} onUpdateLabel={onUpdateLabel} />
    </div>
  );
}

function RectFields({ shape, onUpdateRect, onUpdateLabel }: { shape: RectShape; onUpdateRect: PropertyPanelProps['onUpdateRect']; onUpdateLabel: PropertyPanelProps['onUpdateLabel'] }) {
  const [width, setWidth] = useState(String(shape.widthMm));
  const [height, setHeight] = useState(String(shape.heightMm));

  const commit = () => {
    const w = parseFloat(width);
    const h = parseFloat(height);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return;
    onUpdateRect(shape.id, w, h);
  };

  return (
    <div className="property-grid">
      <div className="field">
        <label>좌상단</label>
        <span className="property-static">({Math.round(shape.center.x - shape.widthMm / 2)}, {Math.round(shape.center.y - shape.heightMm / 2)}) mm</span>
      </div>
      <div className="field">
        <label htmlFor="edit-width">가로 (mm)</label>
        <input id="edit-width" type="number" min="1" value={width} onChange={(e) => setWidth(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} />
      </div>
      <div className="field">
        <label htmlFor="edit-height">세로 (mm)</label>
        <input id="edit-height" type="number" min="1" value={height} onChange={(e) => setHeight(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} />
      </div>
      <LabelField shape={shape} onUpdateLabel={onUpdateLabel} />
    </div>
  );
}

/** TR로 원을 트림하면 남는 호 — 각도까지 편집할 수 있게 만들 정도는 아니라 값만 보여준다 */
function ArcFields({ shape }: { shape: ArcShape }) {
  return (
    <div className="property-grid">
      <div className="field">
        <label>중심</label>
        <span className="property-static">({shape.center.x}, {shape.center.y}) mm</span>
      </div>
      <div className="field">
        <label>반지름</label>
        <span className="property-static">{shape.radiusMm} mm</span>
      </div>
    </div>
  );
}

function TextFields({ shape, onUpdateText }: { shape: TextShape; onUpdateText: PropertyPanelProps['onUpdateText'] }) {
  const [text, setText] = useState(shape.text);

  const commit = () => {
    if (text.trim().length === 0) return;
    onUpdateText(shape.id, text.trim());
  };

  return (
    <div className="property-grid">
      <div className="field">
        <label>위치</label>
        <span className="property-static">({shape.position.x}, {shape.position.y}) mm</span>
      </div>
      <div className="field">
        <label htmlFor="edit-text">텍스트 내용</label>
        <input id="edit-text" type="text" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} />
      </div>
    </div>
  );
}
