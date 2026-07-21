import type { FormEvent } from 'react';
import type { DrawFormState, DrawMode } from './ToolPanel';
import { IconChevronUp, IconPlus } from '../ui/Icon';
import './MobileSheetHandle.css';

interface MobileSheetHandleProps {
  layerName: string;
  layerColor: string;
  mode: DrawMode;
  isDrawable: boolean;
  isBeam: boolean;
  drawForm: DrawFormState;
  onDrawFormChange: (patch: Partial<DrawFormState>) => void;
  onAddLine: (lengthMm: number, angleDeg: number, thicknessMm?: number) => void;
  onAddCircle: (radiusMm: number) => void;
  onAddText: (text: string) => void;
  open: boolean;
  onToggle: () => void;
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
  isDrawable,
  isBeam,
  drawForm,
  onDrawFormChange,
  onAddLine,
  onAddCircle,
  onAddText,
  open,
  onToggle,
}: MobileSheetHandleProps) {
  const { lengthMm, angleDeg, thicknessMm, radiusMm, textValue } = drawForm;
  const length = parseFloat(lengthMm);
  const angle = parseFloat(angleDeg);
  const thickness = parseFloat(thicknessMm);
  const radius = parseFloat(radiusMm);

  const lineValid = Number.isFinite(length) && length > 0 && Number.isFinite(angle) && (!isBeam || (Number.isFinite(thickness) && thickness > 0));
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
      <button type="button" className="mobile-sheet-handle-toggle" onClick={onToggle} aria-expanded={open}>
        <span className="mobile-sheet-handle-grip" aria-hidden="true" />
        <span className="mobile-sheet-handle-row">
          <span className="mobile-sheet-handle-dot" style={{ background: layerColor }} />
          <span className="mobile-sheet-handle-label">{layerName}</span>
          <IconChevronUp className={`mobile-sheet-handle-chevron ${open ? 'is-open' : ''}`} />
        </span>
      </button>

      {!open && isDrawable && (
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
