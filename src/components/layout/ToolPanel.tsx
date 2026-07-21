import { useState, type FormEvent } from 'react';
import Button from '../ui/Button';
import { IconCircle, IconLine, IconText } from '../ui/Icon';
import type { Layer, Point } from '../../types/cad';
import { ALL_LAYERS_ID, DEFAULT_BEAM_THICKNESS_MM } from '../../data/layerMeta';
import './panels.css';
import './ToolPanel.css';

export type DrawMode = 'line' | 'circle' | 'text';
type ColumnShape = 'circle' | 'rect';

interface ToolPanelProps {
  layers: Layer[];
  activeLayerId: string;
  onActiveLayerChange: (id: string) => void;
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  pendingPoint: Point;
  onAddLine: (lengthMm: number, angleDeg: number, thicknessMm?: number) => void;
  onAddCircle: (radiusMm: number) => void;
  onAddRect: (widthMm: number, heightMm: number) => void;
  onAddText: (text: string) => void;
  onResetPending: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onClearAll: () => void;
  canClearAll: boolean;
}

/** 좌측 상단: 정밀 선/도형 그리기 도구. 캔버스를 클릭해 시작점(중심)을 지정한 뒤 값을 입력한다. */
export default function ToolPanel({
  layers,
  activeLayerId,
  onActiveLayerChange,
  mode,
  onModeChange,
  pendingPoint,
  onAddLine,
  onAddCircle,
  onAddRect,
  onAddText,
  onResetPending,
  onUndo,
  canUndo,
  onClearAll,
  canClearAll,
}: ToolPanelProps) {
  const [lengthMm, setLengthMm] = useState('');
  const [angleDeg, setAngleDeg] = useState('');
  const [thicknessMm, setThicknessMm] = useState(String(DEFAULT_BEAM_THICKNESS_MM));
  const [radiusMm, setRadiusMm] = useState('');
  const [widthMm, setWidthMm] = useState('400');
  const [heightMm, setHeightMm] = useState('400');
  const [columnShape, setColumnShape] = useState<ColumnShape>('circle');
  const [textValue, setTextValue] = useState('');

  const isAllLayers = activeLayerId === ALL_LAYERS_ID;
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const isBeam = activeLayer?.category === 'beam';
  const isColumn = activeLayer?.category === 'column';

  const length = parseFloat(lengthMm);
  const angle = parseFloat(angleDeg);
  const thickness = parseFloat(thicknessMm);
  const radius = parseFloat(radiusMm);
  const width = parseFloat(widthMm);
  const height = parseFloat(heightMm);

  const lineValid = Number.isFinite(length) && length > 0 && Number.isFinite(angle) && (!isBeam || (Number.isFinite(thickness) && thickness > 0));
  const circleValid = Number.isFinite(radius) && radius > 0;
  const rectValid = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const textValid = textValue.trim().length > 0;

  const handleSubmitLine = (e: FormEvent) => {
    e.preventDefault();
    if (!lineValid) return;
    onAddLine(length, angle, isBeam ? thickness : undefined);
    setLengthMm('');
    setAngleDeg('');
  };

  const handleSubmitText = (e: FormEvent) => {
    e.preventDefault();
    if (!textValid) return;
    onAddText(textValue.trim());
    setTextValue('');
  };

  const handleSubmitPoint = (e: FormEvent) => {
    e.preventDefault();
    if (isColumn && columnShape === 'rect') {
      if (!rectValid) return;
      onAddRect(width, height);
    } else {
      if (!circleValid) return;
      onAddCircle(radius);
    }
    setRadiusMm('');
  };

  return (
    <section className="panel tool-panel">
      <h2 className="panel-title">그리기 도구</h2>

      <div className="field">
        <label htmlFor="active-layer">그릴 레이어</label>
        <select id="active-layer" value={activeLayerId} onChange={(e) => onActiveLayerChange(e.target.value)}>
          <option value={ALL_LAYERS_ID}>전체 레이어</option>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {isAllLayers ? (
        <p className="tool-hint tool-all-layers-hint">
          전체 레이어를 보는 중이에요. 모든 도형을 선택·이동·삭제·수정할 수 있지만, 새로 그리려면 특정 레이어를 선택해 주세요.
        </p>
      ) : (
        <>
      <div className="tool-mode-switch tool-mode-switch-draw">
        <Button
          size="sm"
          variant="ghost"
          active={mode === 'line'}
          icon={<IconLine />}
          onClick={() => onModeChange('line')}
        >
          선 그리기
        </Button>
        <Button
          size="sm"
          variant="ghost"
          active={mode === 'circle'}
          icon={<IconCircle />}
          onClick={() => onModeChange('circle')}
        >
          도형 그리기
        </Button>
        <Button
          size="sm"
          variant="ghost"
          active={mode === 'text'}
          icon={<IconText />}
          onClick={() => onModeChange('text')}
        >
          텍스트
        </Button>
      </div>

      <p className="tool-pending-point">
        {mode === 'line' ? '시작점' : mode === 'text' ? '텍스트 위치' : '중심점'}: ({pendingPoint.x}, {pendingPoint.y}) mm
        <button type="button" className="tool-pending-reset" onClick={onResetPending}>
          원점으로
        </button>
      </p>
      <p className="tool-hint">캔버스를 클릭해 {mode === 'line' ? '시작점' : mode === 'text' ? '텍스트 위치' : '중심점'}을 바꿀 수 있어요.</p>

      {mode === 'text' ? (
        <form className="tool-form" onSubmit={handleSubmitText}>
          <div className="field">
            <label htmlFor="text-content">텍스트 내용</label>
            <input id="text-content" type="text" placeholder="예: 소화전 위치" value={textValue} onChange={(e) => setTextValue(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={!textValid} className="tool-submit">텍스트 추가</Button>
        </form>
      ) : mode === 'line' ? (
        <form className="tool-form" onSubmit={handleSubmitLine}>
          <div className="field">
            <label htmlFor="length">길이 (mm)</label>
            <input id="length" type="number" min="1" placeholder="예: 3000" value={lengthMm} onChange={(e) => setLengthMm(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="angle">각도 (°)</label>
            <input id="angle" type="number" placeholder="예: 90" value={angleDeg} onChange={(e) => setAngleDeg(e.target.value)} />
          </div>
          {isBeam && (
            <div className="field">
              <label htmlFor="thickness">두께 (mm)</label>
              <input id="thickness" type="number" min="1" placeholder="예: 300" value={thicknessMm} onChange={(e) => setThicknessMm(e.target.value)} />
            </div>
          )}
          <Button type="submit" size="sm" disabled={!lineValid} className="tool-submit">선 추가</Button>
        </form>
      ) : (
        <form className="tool-form" onSubmit={handleSubmitPoint}>
          {isColumn && (
            <div className="tool-mode-switch">
              <Button type="button" size="sm" variant="ghost" active={columnShape === 'circle'} onClick={() => setColumnShape('circle')}>
                원형
              </Button>
              <Button type="button" size="sm" variant="ghost" active={columnShape === 'rect'} onClick={() => setColumnShape('rect')}>
                사각형
              </Button>
            </div>
          )}

          {isColumn && columnShape === 'rect' ? (
            <>
              <div className="field">
                <label htmlFor="width">가로 (mm)</label>
                <input id="width" type="number" min="1" placeholder="예: 400" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="height">세로 (mm)</label>
                <input id="height" type="number" min="1" placeholder="예: 400" value={heightMm} onChange={(e) => setHeightMm(e.target.value)} />
              </div>
              <Button type="submit" size="sm" disabled={!rectValid} className="tool-submit">사각형 추가</Button>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="radius">반지름 (mm)</label>
                <input id="radius" type="number" min="1" placeholder="예: 2600" value={radiusMm} onChange={(e) => setRadiusMm(e.target.value)} />
              </div>
              <Button type="submit" size="sm" disabled={!circleValid} className="tool-submit">원 추가</Button>
            </>
          )}
        </form>
      )}
        </>
      )}

      <div className="tool-session-actions">
        <Button size="sm" variant="ghost" onClick={onUndo} disabled={!canUndo} className="tool-undo">
          마지막 도형 실행 취소
        </Button>
        <Button size="sm" variant="ghost" onClick={onClearAll} disabled={!canClearAll} className="tool-clear-all">
          전체 지우기
        </Button>
      </div>
    </section>
  );
}
