import Button from '../ui/Button';
import { IconAlert, IconCheck, IconShield } from '../ui/Icon';
import { formatMeters } from '../../utils/geometry';
import type { ReviewResult } from '../../utils/review';
import './panels.css';
import './ReviewPanel.css';

interface ReviewPanelProps {
  review: ReviewResult;
  showUncovered: boolean;
  onToggleUncovered: () => void;
  /** 경고를 누르면 관련 도형을 캔버스에서 선택해 보여준다 */
  onSelectShapes: (ids: string[]) => void;
}

/** 좌측 맨 아래: 방호 검토(미방호 구역·간격 경고)와 수량 집계 */
export default function ReviewPanel({ review, showUncovered, onToggleUncovered, onSelectShapes }: ReviewPanelProps) {
  const { quantities, warnings } = review;

  return (
    <section className="panel review-panel">
      <h2 className="panel-title">
        <IconShield className="panel-title-icon" /> 방호 검토
      </h2>

      {review.hasRoom ? (
        <dl className="review-stats">
          <div className="review-stat">
            <dt>실 면적</dt>
            <dd>{review.roomAreaM2}㎡</dd>
          </div>
          <div className="review-stat">
            <dt>방호율</dt>
            <dd className={review.uncoveredAreaM2 > 0 ? 'is-warn' : 'is-ok'}>{review.coveragePct}%</dd>
          </div>
          <div className="review-stat">
            <dt>미방호</dt>
            <dd className={review.uncoveredAreaM2 > 0 ? 'is-warn' : ''}>{review.uncoveredAreaM2}㎡</dd>
          </div>
        </dl>
      ) : (
        <p className="review-hint">벽체로 빈틈없이 둘러싸인 공간이 있어야 면적과 미방호 구역을 계산할 수 있어요.</p>
      )}

      <Button size="sm" variant="ghost" active={showUncovered} onClick={onToggleUncovered} disabled={!review.hasRoom} className="review-toggle">
        미방호 구역 표시 {showUncovered ? 'ON' : 'OFF'}
      </Button>

      {warnings.length > 0 ? (
        <ul className="review-warnings">
          {warnings.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                className="review-warning"
                onClick={() => onSelectShapes(w.shapeIds)}
                disabled={w.shapeIds.length === 0}
              >
                <IconAlert />
                <span>{w.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="review-ok">
          <IconCheck /> {quantities.headCount > 0 ? '간격·이격 경고가 없어요.' : '아직 헤드가 없어요.'}
        </p>
      )}

      <h3 className="review-subtitle">수량</h3>
      <dl className="review-quantities">
        <div><dt>스프링클러 헤드</dt><dd>{quantities.headCount}개</dd></div>
        <div><dt>기둥</dt><dd>{quantities.columnCount}개</dd></div>
        <div><dt>벽체 길이</dt><dd>{formatMeters(quantities.wallLengthMm)}</dd></div>
        <div><dt>보</dt><dd>{quantities.beamCount}개 · {formatMeters(quantities.beamLengthMm)}</dd></div>
      </dl>

      <p className="review-disclaimer">간이 점검용 참고값이에요. 실제 설계 전에는 최신 NFPC 원문을 확인하세요.</p>
    </section>
  );
}
