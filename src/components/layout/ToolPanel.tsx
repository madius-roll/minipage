import type { FormEvent, ReactNode } from 'react';
import Button from '../ui/Button';
import { IconLine, IconPencil, IconShapes, IconSprinklerRadius, IconText } from '../ui/Icon';
import type { Layer, LayerCategory, Point } from '../../types/cad';
import { ALL_LAYERS_ID, DEFAULT_BEAM_THICKNESS_MM } from '../../data/layerMeta';
import './panels.css';
import './ToolPanel.css';

export type DrawMode = 'line' | 'circle' | 'sprinklerHead' | 'text';
export type ColumnShape = 'circle' | 'rect';

const DRAW_MODE_LABEL: Record<DrawMode, string> = {
  line: '선 그리기',
  circle: '도형 그리기',
  sprinklerHead: 'SP헤드반경',
  text: '텍스트',
};

const DRAW_MODE_ICON: Record<DrawMode, ReactNode> = {
  line: <IconLine />,
  circle: <IconShapes />,
  sprinklerHead: <IconSprinklerRadius />,
  text: <IconText />,
};

/** 레이어 용도별로 실제 쓰이는 그리기 도구만 메뉴에 남긴다 (예: 스프링클러 레이어엔 SP헤드반경·텍스트만) */
export function getAllowedDrawModes(category?: LayerCategory): DrawMode[] {
  switch (category) {
    case 'wall':
      return ['line', 'circle', 'text'];
    case 'beam':
      return ['line', 'text'];
    case 'column':
      return ['line', 'circle', 'text'];
    case 'sprinkler':
      return ['sprinklerHead', 'text'];
    default:
      return ['line', 'circle', 'sprinklerHead', 'text'];
  }
}

/** 도형 그리기에서 원/사각형을 함께 고를 수 있는 레이어 — 벽체(방 형태), 기둥(사각 기둥) */
export function supportsRectShape(category?: LayerCategory): boolean {
  return category === 'wall' || category === 'column';
}

/** 선/도형/텍스트 입력값 — 하단 시트 접힌 상태의 미니 입력창과 값을 공유하기 위해 EditorPage에서 관리한다 */
export interface DrawFormState {
  lengthMm: string;
  angleDeg: string;
  thicknessMm: string;
  radiusMm: string;
  widthMm: string;
  heightMm: string;
  columnShape: ColumnShape;
  textValue: string;
}

export const DEFAULT_DRAW_FORM: DrawFormState = {
  lengthMm: '',
  angleDeg: '',
  thicknessMm: String(DEFAULT_BEAM_THICKNESS_MM),
  radiusMm: '',
  widthMm: '400',
  heightMm: '400',
  columnShape: 'circle',
  textValue: '',
};

interface ToolPanelProps {
  layers: Layer[];
  activeLayerId: string;
  onActiveLayerChange: (id: string) => void;
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  pendingPoint: Point;
  /** 마우스로 직접 그리기 모드(무장 상태) — 켜져 있으면 캔버스 클릭으로 시작점→끝점을 순서대로 찍어 도형을 완성한다 */
  drawArmed: boolean;
  onToggleDrawArmed: () => void;
  /** 무장 상태에서 다음 클릭이 시작점을 정하는 차례인지, 끝점을 찍어 도형을 완성하는 차례인지 */
  drawPhase: 'start' | 'end';
  drawForm: DrawFormState;
  onDrawFormChange: (patch: Partial<DrawFormState>) => void;
  onAddLine: (lengthMm: number, angleDeg: number, thicknessMm?: number) => void;
  onAddCircle: (radiusMm: number) => void;
  onAddRect: (widthMm: number, heightMm: number) => void;
  onAddSprinklerHead: (radiusMm: number) => void;
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
  drawArmed,
  onToggleDrawArmed,
  drawPhase,
  drawForm,
  onDrawFormChange,
  onAddLine,
  onAddCircle,
  onAddRect,
  onAddSprinklerHead,
  onAddText,
  onResetPending,
  onUndo,
  canUndo,
  onClearAll,
  canClearAll,
}: ToolPanelProps) {
  const { lengthMm, angleDeg, thicknessMm, radiusMm, widthMm, heightMm, columnShape, textValue } = drawForm;

  const isAllLayers = activeLayerId === ALL_LAYERS_ID;
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const isBeam = activeLayer?.category === 'beam';
  const canPickRectShape = supportsRectShape(activeLayer?.category);
  const allowedModes = getAllowedDrawModes(activeLayer?.category);

  const length = parseFloat(lengthMm);
  const angle = parseFloat(angleDeg);
  const thickness = parseFloat(thicknessMm);
  const radius = parseFloat(radiusMm);
  const width = parseFloat(widthMm);
  const height = parseFloat(heightMm);

  const lineValid = Number.isFinite(length) && length !== 0 && Number.isFinite(angle) && (!isBeam || (Number.isFinite(thickness) && thickness > 0));
  const circleValid = Number.isFinite(radius) && radius > 0;
  const rectValid = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const textValid = textValue.trim().length > 0;

  const handleSubmitLine = (e: FormEvent) => {
    e.preventDefault();
    if (!lineValid) return;
    onAddLine(length, angle, isBeam ? thickness : undefined);
    onDrawFormChange({ lengthMm: '', angleDeg: '' });
  };

  const handleSubmitText = (e: FormEvent) => {
    e.preventDefault();
    if (!textValid) return;
    onAddText(textValue.trim());
    onDrawFormChange({ textValue: '' });
  };

  const handleSubmitPoint = (e: FormEvent) => {
    e.preventDefault();
    if (canPickRectShape && columnShape === 'rect') {
      if (!rectValid) return;
      onAddRect(width, height);
    } else {
      if (!circleValid) return;
      onAddCircle(radius);
    }
    onDrawFormChange({ radiusMm: '' });
  };

  const handleSubmitSprinklerHead = (e: FormEvent) => {
    e.preventDefault();
    if (!circleValid) return;
    onAddSprinklerHead(radius);
    onDrawFormChange({ radiusMm: '' });
  };

  return (
    <section className="panel tool-panel">
      <h2 className="panel-title">그리기 도구</h2>

      <div className="field tool-active-layer-field">
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
        {allowedModes.map((m) => (
          <Button
            key={m}
            size="sm"
            variant="ghost"
            active={mode === m}
            icon={DRAW_MODE_ICON[m]}
            onClick={() => onModeChange(m)}
          >
            {DRAW_MODE_LABEL[m]}
          </Button>
        ))}
      </div>

      <p className="tool-pending-point">
        {mode === 'line' ? '시작점' : mode === 'text' ? '텍스트 위치' : '중심점'}: ({pendingPoint.x}, {pendingPoint.y}) mm
        <button type="button" className="tool-pending-reset" onClick={onResetPending}>
          원점으로
        </button>
      </p>
      <p className="tool-hint">캔버스를 클릭해 {mode === 'line' ? '시작점' : mode === 'text' ? '텍스트 위치' : '중심점'}을 바꿀 수 있어요.</p>

      {mode !== 'text' && (
        <>
          <Button
            size="sm"
            variant="ghost"
            active={drawArmed}
            icon={<IconPencil />}
            onClick={onToggleDrawArmed}
            className="tool-draw-toggle"
          >
            마우스로 그리기 {drawArmed ? 'ON' : 'OFF'}
          </Button>
          {drawArmed && (
            <p className="tool-hint">
              {drawPhase === 'start'
                ? `캔버스를 클릭해 ${mode === 'line' ? '시작점' : '중심점'}을 찍으세요.`
                : `캔버스에서 ${mode === 'line' ? '끝점' : '반지름 지점'}을 클릭하면 바로 그려져요. (Esc: 취소)`}
            </p>
          )}
        </>
      )}

      {mode === 'text' ? (
        <form className="tool-form" onSubmit={handleSubmitText}>
          <div className="field">
            <label htmlFor="text-content">텍스트 내용</label>
            <input id="text-content" type="text" placeholder="예: 소화전 위치" value={textValue} onChange={(e) => onDrawFormChange({ textValue: e.target.value })} />
          </div>
          <Button type="submit" size="sm" disabled={!textValid} className="tool-submit">텍스트 추가</Button>
        </form>
      ) : mode === 'line' ? (
        <form className="tool-form" onSubmit={handleSubmitLine}>
          <div className="field">
            <label htmlFor="length">길이 (mm)</label>
            <input id="length" type="number" placeholder="예: 3000 (음수면 반대 방향)" value={lengthMm} onChange={(e) => onDrawFormChange({ lengthMm: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="angle">각도 (°)</label>
            <input id="angle" type="number" placeholder="예: 90" value={angleDeg} onChange={(e) => onDrawFormChange({ angleDeg: e.target.value })} />
          </div>
          {isBeam && (
            <div className="field">
              <label htmlFor="thickness">두께 (mm)</label>
              <input id="thickness" type="number" min="1" placeholder="예: 300" value={thicknessMm} onChange={(e) => onDrawFormChange({ thicknessMm: e.target.value })} />
            </div>
          )}
          <Button type="submit" size="sm" disabled={!lineValid} className="tool-submit">선 추가</Button>
        </form>
      ) : mode === 'sprinklerHead' ? (
        <form className="tool-form" onSubmit={handleSubmitSprinklerHead}>
          <div className="field">
            <label htmlFor="sp-radius">방호 반경 (mm)</label>
            <input id="sp-radius" type="number" min="1" placeholder="예: 2600" value={radiusMm} onChange={(e) => onDrawFormChange({ radiusMm: e.target.value })} />
          </div>
          <Button type="submit" size="sm" disabled={!circleValid} className="tool-submit">SP헤드반경 추가</Button>
        </form>
      ) : (
        <form className="tool-form" onSubmit={handleSubmitPoint}>
          {canPickRectShape && (
            <div className="tool-mode-switch">
              <Button type="button" size="sm" variant="ghost" active={columnShape === 'circle'} onClick={() => onDrawFormChange({ columnShape: 'circle' })}>
                원형
              </Button>
              <Button type="button" size="sm" variant="ghost" active={columnShape === 'rect'} onClick={() => onDrawFormChange({ columnShape: 'rect' })}>
                사각형
              </Button>
            </div>
          )}

          {canPickRectShape && columnShape === 'rect' ? (
            <>
              <div className="field">
                <label htmlFor="width">가로 (mm)</label>
                <input id="width" type="number" min="1" placeholder="예: 400" value={widthMm} onChange={(e) => onDrawFormChange({ widthMm: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="height">세로 (mm)</label>
                <input id="height" type="number" min="1" placeholder="예: 400" value={heightMm} onChange={(e) => onDrawFormChange({ heightMm: e.target.value })} />
              </div>
              <Button type="submit" size="sm" disabled={!rectValid} className="tool-submit">사각형 추가</Button>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="radius">반지름 (mm)</label>
                <input id="radius" type="number" min="1" placeholder="예: 2600" value={radiusMm} onChange={(e) => onDrawFormChange({ radiusMm: e.target.value })} />
              </div>
              <Button type="submit" size="sm" disabled={!circleValid} className="tool-submit">원 추가</Button>
            </>
          )}
        </form>
      )}
        </>
      )}

      <div className="tool-session-actions">
        {!isAllLayers && (
          <Button size="sm" variant="ghost" onClick={onUndo} disabled={!canUndo} className="tool-undo">
            마지막 도형 실행 취소
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClearAll} disabled={!canClearAll} className="tool-clear-all">
          전체 지우기
        </Button>
      </div>
    </section>
  );
}
