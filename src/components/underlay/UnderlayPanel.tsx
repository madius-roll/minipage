import { useState } from 'react';
import Button from '../ui/Button';
import { IconImage, IconRuler } from '../ui/Icon';
import type { Point, Underlay } from '../../types/cad';
import { distanceMm, formatMeters } from '../../utils/geometry';
import '../layout/panels.css';
import './UnderlayPanel.css';

interface UnderlayPanelProps {
  underlay: Underlay | null;
  onOpenWizard: () => void;
  onAdjust: (patch: Partial<Pick<Underlay, 'opacity' | 'invert' | 'enhance' | 'visible'>>) => void;
  /** "1:N" 축척을 다시 입력 (종이 크기를 아는 바탕 도면에서만 쓸 수 있다) */
  onSetRatio: (ratio: number) => void;
  onRemove: () => void;
  measureMode: boolean;
  onToggleMeasure: () => void;
  /** 캔버스에서 잰 두 점 — 두 번째 점을 아직 안 찍었으면 b가 null */
  measure: { a: Point; b: Point | null } | null;
  /** 방금 잰 거리가 실제로는 이 길이(mm)라고 알려 주면, 바탕 도면의 축척을 거기에 맞춘다 */
  onRescaleToMeasure: (expectedMm: number) => void;
}

/** 사이드바: 바탕 도면(사진·PDF)의 보기 설정과 축척, 거리 재기 */
export default function UnderlayPanel({
  underlay,
  onOpenWizard,
  onAdjust,
  onSetRatio,
  onRemove,
  measureMode,
  onToggleMeasure,
  measure,
  onRescaleToMeasure,
}: UnderlayPanelProps) {
  const [expected, setExpected] = useState('');
  const currentRatio = underlay?.paperMmPerPx ? Math.round((underlay.mmPerPx / underlay.paperMmPerPx) * 100) / 100 : null;
  const [ratioDraft, setRatioDraft] = useState<string | null>(null);

  const measuredMm = measure?.b ? Math.round(distanceMm(measure.a, measure.b)) : null;
  const expectedMm = parseFloat(expected);
  const hasExpected = measuredMm !== null && measuredMm > 0 && Number.isFinite(expectedMm) && expectedMm > 0;
  const errorPct = hasExpected ? Math.round((Math.abs(measuredMm - expectedMm) / expectedMm) * 1000) / 10 : null;

  const commitRatio = () => {
    const n = parseFloat(ratioDraft ?? '');
    if (Number.isFinite(n) && n > 0 && n !== currentRatio) onSetRatio(n);
    setRatioDraft(null);
  };

  return (
    <section className="panel underlay-panel">
      <h2 className="panel-title">
        <IconImage className="panel-title-icon" /> 바탕 도면
      </h2>

      {underlay ? (
        <>
          <p className="underlay-panel-size">
            실제 크기 가로 {formatMeters(underlay.widthPx * underlay.mmPerPx)} × 세로 {formatMeters(underlay.heightPx * underlay.mmPerPx)}
          </p>

          <div className="underlay-panel-toggles">
            <Button size="sm" variant="ghost" active={underlay.visible} onClick={() => onAdjust({ visible: !underlay.visible })}>
              {underlay.visible ? '보임' : '숨김'}
            </Button>
            <Button size="sm" variant="ghost" active={underlay.invert} onClick={() => onAdjust({ invert: !underlay.invert })} title="흰 종이를 어두운 화면에 맞게 뒤집어 보여줘요">
              반전
            </Button>
            <Button size="sm" variant="ghost" active={underlay.enhance} onClick={() => onAdjust({ enhance: !underlay.enhance })} title="흑백으로 바꾸고 대비를 올려 그림자와 종이색을 걷어내요">
              선명하게
            </Button>
          </div>

          <div className="field">
            <label htmlFor="underlay-opacity">진하기 {Math.round(underlay.opacity * 100)}%</label>
            <input
              id="underlay-opacity"
              type="range"
              min="10"
              max="100"
              step="5"
              value={Math.round(underlay.opacity * 100)}
              onChange={(e) => onAdjust({ opacity: Number(e.target.value) / 100 })}
            />
          </div>

          {currentRatio !== null && (
            <div className="field">
              <label htmlFor="underlay-panel-ratio">축척 1 : N</label>
              <input
                id="underlay-panel-ratio"
                type="number"
                inputMode="decimal"
                min="1"
                value={ratioDraft ?? String(currentRatio)}
                onChange={(e) => setRatioDraft(e.target.value)}
                onBlur={commitRatio}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </div>
          )}

          <div className="underlay-panel-row">
            <Button size="sm" variant="ghost" onClick={onOpenWizard}>바꾸기</Button>
            <Button size="sm" variant="ghost" onClick={onRemove} className="underlay-panel-remove">지우기</Button>
          </div>
        </>
      ) : (
        <>
          <p className="underlay-panel-hint">종이 도면 사진이나 PDF를 바닥에 깔고, 축척을 맞춘 뒤 그 위에 바로 헤드를 그릴 수 있어요.</p>
          <Button size="sm" icon={<IconImage />} onClick={onOpenWizard} className="underlay-panel-add">사진·파일 깔기</Button>
        </>
      )}

      <h3 className="underlay-panel-subtitle">거리 재기</h3>
      <Button size="sm" variant="ghost" active={measureMode} icon={<IconRuler />} onClick={onToggleMeasure} className="underlay-panel-add">
        거리 재기 {measureMode ? 'ON' : 'OFF'}
      </Button>
      {measuredMm !== null ? (
        <>
          <p className="underlay-panel-measured">
            잰 거리 <strong>{formatMeters(measuredMm)}</strong> ({measuredMm.toLocaleString('ko-KR')}mm)
          </p>
          {underlay && (
            <>
              <div className="field">
                <label htmlFor="underlay-expected">도면에 적힌 치수 (mm)</label>
                <input id="underlay-expected" type="number" inputMode="decimal" min="1" placeholder="적힌 치수와 비교해 보세요" value={expected} onChange={(e) => setExpected(e.target.value)} />
              </div>
              {errorPct !== null && (
                <p className={`underlay-panel-error ${errorPct > 2 ? 'is-warn' : 'is-ok'}`}>
                  오차 {errorPct}% {errorPct > 2 ? '— 축척이 어긋나 있어요' : '— 잘 맞아요'}
                </p>
              )}
              <Button size="sm" variant="ghost" onClick={() => onRescaleToMeasure(expectedMm)} disabled={!hasExpected || errorPct === 0} className="underlay-panel-add">
                이 치수에 축척 맞추기
              </Button>
            </>
          )}
        </>
      ) : (
        <p className="underlay-panel-hint">
          {measureMode ? '캔버스에서 두 점을 차례로 찍으세요.' : '두 점 사이의 실제 거리를 재서, 도면에 적힌 치수와 맞는지 확인할 수 있어요.'}
        </p>
      )}
    </section>
  );
}
