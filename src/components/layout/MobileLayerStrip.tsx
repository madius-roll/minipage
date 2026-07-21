import type { Layer } from '../../types/cad';
import { ALL_LAYERS_ID } from '../../data/layerMeta';
import './MobileLayerStrip.css';

interface MobileLayerStripProps {
  layers: Layer[];
  activeLayerId: string;
  onSelectActiveLayer: (id: string) => void;
}

/** 모바일 전용: 헤더 바로 아래 가로 스크롤 레이어 칩 목록. 탭 한 번으로 그릴 레이어를 바꾼다. PC에서는 렌더링되지 않는다(CSS로 숨김). */
export default function MobileLayerStrip({ layers, activeLayerId, onSelectActiveLayer }: MobileLayerStripProps) {
  return (
    <div className="mobile-layer-strip">
      <button
        type="button"
        className={`mobile-layer-chip ${activeLayerId === ALL_LAYERS_ID ? 'is-active' : ''}`}
        onClick={() => onSelectActiveLayer(ALL_LAYERS_ID)}
      >
        전체
      </button>
      {layers.map((layer) => (
        <button
          key={layer.id}
          type="button"
          className={`mobile-layer-chip ${layer.id === activeLayerId ? 'is-active' : ''}`}
          onClick={() => onSelectActiveLayer(layer.id)}
        >
          <span className="mobile-layer-chip-dot" style={{ background: layer.color }} />
          {layer.name}
        </button>
      ))}
    </div>
  );
}
