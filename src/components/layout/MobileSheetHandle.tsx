import type { DrawMode } from './ToolPanel';
import { IconChevronUp, IconCircle, IconLine, IconText } from '../ui/Icon';
import './MobileSheetHandle.css';

interface MobileSheetHandleProps {
  layerName: string;
  layerColor: string;
  mode: DrawMode;
  open: boolean;
  onToggle: () => void;
}

/** 모바일 전용: 캔버스 하단에 항상 떠 있는 손잡이. 탭하면 그리기 도구/레이어/속성 시트가 캔버스 위로 펼쳐진다. PC에서는 렌더링되지 않는다(CSS로 숨김). */
export default function MobileSheetHandle({ layerName, layerColor, mode, open, onToggle }: MobileSheetHandleProps) {
  return (
    <button type="button" className="mobile-sheet-handle" onClick={onToggle} aria-expanded={open}>
      <span className="mobile-sheet-handle-grip" aria-hidden="true" />
      <span className="mobile-sheet-handle-row">
        <span className="mobile-sheet-handle-dot" style={{ background: layerColor }} />
        <span className="mobile-sheet-handle-label">{layerName}</span>
        <span className="mobile-sheet-handle-mode">
          {mode === 'line' ? <IconLine /> : mode === 'circle' ? <IconCircle /> : <IconText />}
        </span>
        <IconChevronUp className={`mobile-sheet-handle-chevron ${open ? 'is-open' : ''}`} />
      </span>
    </button>
  );
}
