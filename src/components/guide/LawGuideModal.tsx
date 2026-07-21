import { useEffect, useState } from 'react';
import { IconBook, IconX } from '../ui/Icon';
import { dummyLawArticles, type LawCategory } from '../../data/lawGuideData';
import './LawGuideModal.css';

interface LawGuideModalProps {
  onClose: () => void;
}

const CATEGORIES: ('전체' | LawCategory)[] = ['전체', '헤드', '배관', '수원', '가압송수장치'];

/** 도면 작성 중 참조하는 소방 법령(NFPC) 가이드 팝업 */
export default function LawGuideModal({ onClose }: LawGuideModalProps) {
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>('전체');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const articles = dummyLawArticles.filter((a) => activeCategory === '전체' || a.category === activeCategory);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="law-guide-title">
        <header className="modal-header">
          <h2 id="law-guide-title">
            <IconBook className="modal-header-icon" /> 소방 법령 가이드
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            <IconX />
          </button>
        </header>

        <p className="modal-disclaimer">
          예시 참고용 데이터입니다. 실제 설계·시공 전에는 반드시 최신 NFPC(화재안전성능기준) 원문을 확인하세요.
        </p>

        <div className="law-category-tabs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`law-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <ul className="law-list">
          {articles.map((a) => (
            <li key={a.id} className="law-card">
              <div className="law-card-head">
                <span className="law-code">{a.code}</span>
                <span className="law-category-badge">{a.category}</span>
              </div>
              <h3 className="law-title">{a.title}</h3>
              <p className="law-summary">{a.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
