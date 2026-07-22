import { useEffect, useState, type FormEvent } from 'react';
import type { Shape } from '../../types/cad';
import type { DrawFormState, DrawMode } from './ToolPanel';
import { IconChevronUp, IconCircle, IconLine, IconPlus, IconText } from '../ui/Icon';
import './MobileSheetHandle.css';

interface MobileSheetHandleProps {
  layerName: string;
  layerColor: string;
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  isDrawable: boolean;
  isBeam: boolean;
  drawForm: DrawFormState;
  onDrawFormChange: (patch: Partial<DrawFormState>) => void;
  onAddLine: (lengthMm: number, angleDeg: number, thicknessMm?: number) => void;
  onAddCircle: (radiusMm: number) => void;
  onAddText: (text: string) => void;
  /** 도형 하나가 선택되어 있으면 새로 그리기 대신 그 도형의 수치를 바로 보여주고 즉시 수정할 수 있게 한다 */
  selectedShape: Shape | null;
  onUpdateLine: (id: string, lengthMm: number, angleDeg: number, thicknessMm?: number) => void;
  onUpdateCircle: (id: string, radiusMm: number) => void;
  onUpdateRect: (id: string, widthMm: number, heightMm: number) => void;
  open: boolean;
  onToggle: () => void;
}

/** 선택된 도형의 수치를 실시간으로 보여주고, 입력할 때마다 즉시 반영하는 미니 편집 폼 */
function SelectedShapeQuickEdit({
  shape,
  onUpdateLine,
  onUpdateCircle,
  onUpdateRect,
}: {
  shape: Shape;
  onUpdateLine: MobileSheetHandleProps['onUpdateLine'];
  onUpdateCircle: MobileSheetHandleProps['onUpdateCircle'];
  onUpdateRect: MobileSheetHandleProps['onUpdateRect'];
}) {
  const [length, setLength] = useState('');
  const [angle, setAngle] = useState('');
  const [thickness, setThickness] = useState('');
  const [radius, setRadius] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  // 선택된 도형이 바뀔 때마다(다른 도형 선택 등) 입력값을 그 도형의 현재 수치로 다시 채운다.
  useEffect(() => {
    if (shape.kind === 'line') {
      setLength(String(shape.lengthMm));
      setAngle(String(shape.angleDeg));
      setThickness(String(shape.thicknessMm ?? ''));
    } else if (shape.kind === 'circle') {
      setRadius(String(shape.radiusMm));
    } else if (shape.kind === 'rect') {
      setWidth(String(shape.widthMm));
      setHeight(String(shape.heightMm));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.id]);

  if (shape.kind === 'line') {
    const hasThickness = shape.thicknessMm !== undefined;
    const commit = (patch: { length?: string; angle?: string; thickness?: string }) => {
      const l = parseFloat(patch.length ?? length);
      const a = parseFloat(patch.angle ?? angle);
      const t = parseFloat(patch.thickness ?? thickness);
      if (!Number.isFinite(l) || l === 0 || !Number.isFinite(a)) return;
      onUpdateLine(shape.id, l, a, hasThickness && Number.isFinite(t) && t > 0 ? t : undefined);
    };
    return (
      <div className="mobile-quick-form mobile-quick-edit">
        <input
          type="number"
          inputMode="decimal"
          className="mobile-quick-input"
          placeholder="길이(mm)"
          value={length}
          onChange={(e) => { setLength(e.target.value); commit({ length: e.target.value }); }}
        />
        <input
          type="number"
          inputMode="decimal"
          className="mobile-quick-input"
          placeholder="각도(°)"
          value={angle}
          onChange={(e) => { setAngle(e.target.value); commit({ angle: e.target.value }); }}
        />
        {hasThickness && (
          <input
            type="number"
            inputMode="decimal"
            className="mobile-quick-input"
            placeholder="두께(mm)"
            value={thickness}
            onChange={(e) => { setThickness(e.target.value); commit({ thickness: e.target.value }); }}
          />
        )}
      </div>
    );
  }

  if (shape.kind === 'circle') {
    return (
      <div className="mobile-quick-form mobile-quick-edit">
        <input
          type="number"
          inputMode="decimal"
          className="mobile-quick-input"
          placeholder="반지름(mm)"
          value={radius}
          onChange={(e) => {
            setRadius(e.target.value);
            const r = parseFloat(e.target.value);
            if (Number.isFinite(r) && r > 0) onUpdateCircle(shape.id, r);
          }}
        />
      </div>
    );
  }

  if (shape.kind === 'rect') {
    const commit = (patch: { width?: string; height?: string }) => {
      const w = parseFloat(patch.width ?? width);
      const h = parseFloat(patch.height ?? height);
      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return;
      onUpdateRect(shape.id, w, h);
    };
    return (
      <div className="mobile-quick-form mobile-quick-edit">
        <input
          type="number"
          inputMode="decimal"
          className="mobile-quick-input"
          placeholder="가로(mm)"
          value={width}
          onChange={(e) => { setWidth(e.target.value); commit({ width: e.target.value }); }}
        />
        <input
          type="number"
          inputMode="decimal"
          className="mobile-quick-input"
          placeholder="세로(mm)"
          value={height}
          onChange={(e) => { setHeight(e.target.value); commit({ height: e.target.value }); }}
        />
      </div>
    );
  }

  return null;
}

/**
 * 모바일 전용: 캔버스 하단에 항상 떠 있는 손잡이.
 * 접혀 있을 때도 현재 그리기 모드의 핵심 입력값(길이/각도, 반지름, 텍스트)을 바로 채워 넣고 추가할 수 있다 —
 * 시트를 펼치지 않고도 최소한의 탭으로 도형을 그릴 수 있게 하기 위함. PC에서는 렌더링되지 않는다(CSS로 숨김).
 */
export default function MobileSheetHandle({
  layerName,
  layerColor,
  mode,
  onModeChange,
  isDrawable,
  isBeam,
  drawForm,
  onDrawFormChange,
  onAddLine,
  onAddCircle,
  onAddText,
  selectedShape,
  onUpdateLine,
  onUpdateCircle,
  onUpdateRect,
  open,
  onToggle,
}: MobileSheetHandleProps) {
  const { lengthMm, angleDeg, thicknessMm, radiusMm, textValue } = drawForm;
  const length = parseFloat(lengthMm);
  const angle = parseFloat(angleDeg);
  const thickness = parseFloat(thicknessMm);
  const radius = parseFloat(radiusMm);

  const lineValid = Number.isFinite(length) && length !== 0 && Number.isFinite(angle) && (!isBeam || (Number.isFinite(thickness) && thickness > 0));
  const circleValid = Number.isFinite(radius) && radius > 0;
  const textValid = textValue.trim().length > 0;
  const quickValid = mode === 'line' ? lineValid : mode === 'circle' ? circleValid : textValid;

  const handleQuickSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!quickValid) return;
    if (mode === 'line') {
      onAddLine(length, angle, isBeam ? thickness : undefined);
      onDrawFormChange({ lengthMm: '', angleDeg: '' });
    } else if (mode === 'circle') {
      onAddCircle(radius);
      onDrawFormChange({ radiusMm: '' });
    } else {
      onAddText(textValue.trim());
      onDrawFormChange({ textValue: '' });
    }
  };

  return (
    <div className="mobile-sheet-handle">
      <div className="mobile-mode-switch" role="group" aria-label="그리기 모드">
        <button
          type="button"
          className={`mobile-mode-btn ${mode === 'line' ? 'is-active' : ''}`}
          onClick={() => onModeChange('line')}
          aria-label="선 그리기"
          aria-pressed={mode === 'line'}
        >
          <IconLine />
        </button>
        <button
          type="button"
          className={`mobile-mode-btn ${mode === 'circle' ? 'is-active' : ''}`}
          onClick={() => onModeChange('circle')}
          aria-label="도형 그리기"
          aria-pressed={mode === 'circle'}
        >
          <IconCircle />
        </button>
        <button
          type="button"
          className={`mobile-mode-btn ${mode === 'text' ? 'is-active' : ''}`}
          onClick={() => onModeChange('text')}
          aria-label="텍스트"
          aria-pressed={mode === 'text'}
        >
          <IconText />
        </button>
      </div>

      <button type="button" className="mobile-sheet-handle-toggle" onClick={onToggle} aria-expanded={open}>
        <span className="mobile-sheet-handle-grip" aria-hidden="true" />
        <span className="mobile-sheet-handle-row">
          <span className="mobile-sheet-handle-dot" style={{ background: layerColor }} />
          <span className="mobile-sheet-handle-label">
            {selectedShape ? '선택한 도형 수정' : layerName}
          </span>
          <IconChevronUp className={`mobile-sheet-handle-chevron ${open ? 'is-open' : ''}`} />
        </span>
      </button>

      {!open && selectedShape && (
        <SelectedShapeQuickEdit
          key={selectedShape.id}
          shape={selectedShape}
          onUpdateLine={onUpdateLine}
          onUpdateCircle={onUpdateCircle}
          onUpdateRect={onUpdateRect}
        />
      )}

      {!open && !selectedShape && isDrawable && (
        <form className="mobile-quick-form" onSubmit={handleQuickSubmit}>
          {mode === 'line' && (
            <>
              <input
                type="number"
                inputMode="decimal"
                className="mobile-quick-input"
                placeholder="길이(mm)"
                value={lengthMm}
                onChange={(e) => onDrawFormChange({ lengthMm: e.target.value })}
              />
              <input
                type="number"
                inputMode="decimal"
                className="mobile-quick-input"
                placeholder="각도(°)"
                value={angleDeg}
                onChange={(e) => onDrawFormChange({ angleDeg: e.target.value })}
              />
              {isBeam && (
                <input
                  type="number"
                  inputMode="decimal"
                  className="mobile-quick-input"
                  placeholder="두께(mm)"
                  value={thicknessMm}
                  onChange={(e) => onDrawFormChange({ thicknessMm: e.target.value })}
                />
              )}
            </>
          )}
          {mode === 'circle' && (
            <input
              type="number"
              inputMode="decimal"
              className="mobile-quick-input"
              placeholder="반지름(mm)"
              value={radiusMm}
              onChange={(e) => onDrawFormChange({ radiusMm: e.target.value })}
            />
          )}
          {mode === 'text' && (
            <input
              type="text"
              className="mobile-quick-input mobile-quick-input-text"
              placeholder="텍스트 내용"
              value={textValue}
              onChange={(e) => onDrawFormChange({ textValue: e.target.value })}
            />
          )}
          <button type="submit" className="mobile-quick-submit" disabled={!quickValid} aria-label="추가">
            <IconPlus />
          </button>
        </form>
      )}
    </div>
  );
}
