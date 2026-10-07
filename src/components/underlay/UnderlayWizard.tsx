import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Button from '../ui/Button';
import { IconCamera, IconImage, IconRotate, IconX } from '../ui/Icon';
import PointStage from './PointStage';
import type { Point, Underlay } from '../../types/cad';
import { formatMeters } from '../../utils/geometry';
import { loadImageFile, rotateImage90, warpToRectangle, type LoadedImage } from '../../utils/imageWarp';
import { renderPdfPage } from '../../utils/pdfImport';
import './UnderlayWizard.css';

interface UnderlayWizardProps {
  onComplete: (underlay: Underlay) => void;
  onClose: () => void;
}

type Step = 'pick' | 'corners' | 'scale';
type ScaleMethod = 'twoPoint' | 'ratio';

/** 용지의 긴 변 길이(mm) — 사진 전체가 용지 한 장일 때 "1:N" 축척을 쓰려면 종이 크기를 알아야 한다 */
const PAPER_LONG_SIDE_MM: Record<string, number> = {
  A4: 297,
  A3: 420,
  A2: 594,
  A1: 841,
  A0: 1189,
  B5: 257,
  B4: 364,
};
const CUSTOM_PAPER = 'custom';

const CORNER_LABELS = ['좌상', '우상', '우하', '좌하'];
const TWO_POINT_LABELS = ['A', 'B'];

const defaultCorners = (image: LoadedImage): Point[] => {
  const mx = image.width * 0.06;
  const my = image.height * 0.06;
  return [
    { x: mx, y: my },
    { x: image.width - mx, y: my },
    { x: image.width - mx, y: image.height - my },
    { x: mx, y: image.height - my },
  ];
};

const defaultTwoPoints = (image: LoadedImage): Point[] => [
  { x: image.width * 0.25, y: image.height * 0.5 },
  { x: image.width * 0.75, y: image.height * 0.5 },
];

/**
 * 바탕 도면 깔기 — 사진을 찍거나 파일을 고르고, 비스듬한 사진은 네 모서리로 펴고, 축척을 맞춘다.
 * 축척은 "치수를 아는 두 점 + 실제 길이" 또는 "1:N"(종이 크기를 아는 경우) 중 편한 쪽으로 맞춘다.
 */
export default function UnderlayWizard({ onComplete, onClose }: UnderlayWizardProps) {
  const [step, setStep] = useState<Step>('pick');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 불러온 원본(사진은 보정 전, PDF는 그림으로 바꾼 한 쪽) */
  const [source, setSource] = useState<LoadedImage | null>(null);
  /** 축척을 맞출 최종 그림 (원근 보정을 했으면 편 결과, 아니면 원본) */
  const [flat, setFlat] = useState<LoadedImage | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [twoPoints, setTwoPoints] = useState<Point[]>([]);
  const [method, setMethod] = useState<ScaleMethod>('twoPoint');
  const [realLength, setRealLength] = useState('');
  const [ratio, setRatio] = useState('100');
  const [paper, setPaper] = useState('A4');
  const [customPaperMm, setCustomPaperMm] = useState('');
  /** PDF일 때만: 파일과 쪽 정보, 종이 위 1px의 크기 */
  const [pdf, setPdf] = useState<{ file: File; page: number; pageCount: number; paperMmPerPx: number } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리하지 못했어요. 다른 파일로 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  };

  const goToScale = (image: LoadedImage, defaultMethod: ScaleMethod) => {
    setFlat(image);
    setTwoPoints(defaultTwoPoints(image));
    setMethod(defaultMethod);
    setStep('scale');
  };

  const loadPdfPage = (file: File, page: number) => run('PDF를 여는 중…', async () => {
    const rendered = await renderPdfPage(file, page);
    setPdf({ file, page, pageCount: rendered.pageCount, paperMmPerPx: rendered.paperMmPerPx });
    setSource(rendered);
    // PDF는 이미 반듯하고 종이 크기도 알고 있으므로 모서리 보정을 건너뛰고 바로 1:N 축척으로 간다
    goToScale(rendered, 'ratio');
  });

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      void loadPdfPage(file, 1);
      return;
    }
    void run('사진을 불러오는 중…', async () => {
      const image = await loadImageFile(file);
      setPdf(null);
      setSource(image);
      setCorners(defaultCorners(image));
      setStep('corners');
    });
  };

  const handleRotate = () => {
    if (!source) return;
    void run('돌리는 중…', async () => {
      const rotated = await rotateImage90(source);
      setSource(rotated);
      setCorners(defaultCorners(rotated));
    });
  };

  const handleApplyCorners = () => {
    if (!source) return;
    void run('사진을 반듯하게 펴는 중…', async () => {
      goToScale(await warpToRectangle(source, corners), 'twoPoint');
    });
  };

  // ── 축척 계산 ──
  const pointDistancePx = twoPoints.length === 2 ? Math.hypot(twoPoints[1].x - twoPoints[0].x, twoPoints[1].y - twoPoints[0].y) : 0;
  const realLengthMm = parseFloat(realLength);
  const ratioN = parseFloat(ratio);
  const customMm = parseFloat(customPaperMm);
  const paperLongSideMm = paper === CUSTOM_PAPER ? customMm : PAPER_LONG_SIDE_MM[paper];
  /** 그림 1px이 종이 위에서 몇 mm인지 — PDF는 파일에서 알고, 사진은 고른 용지 크기로 어림한다 */
  const paperMmPerPx = pdf
    ? pdf.paperMmPerPx
    : flat && Number.isFinite(paperLongSideMm) && paperLongSideMm > 0 ? paperLongSideMm / Math.max(flat.width, flat.height) : null;

  let mmPerPx: number | null = null;
  if (method === 'twoPoint') {
    if (pointDistancePx > 1 && Number.isFinite(realLengthMm) && realLengthMm > 0) mmPerPx = realLengthMm / pointDistancePx;
  } else if (paperMmPerPx && Number.isFinite(ratioN) && ratioN > 0) {
    mmPerPx = paperMmPerPx * ratioN;
  }

  const handleFinish = () => {
    if (!flat || !mmPerPx) return;
    onComplete({
      imageUrl: flat.url,
      blob: flat.blob,
      widthPx: flat.width,
      heightPx: flat.height,
      origin: { x: 0, y: 0 },
      mmPerPx,
      // 두 점으로 맞춘 사진은 종이 크기를 모르므로 나중에 1:N으로 바꿀 수 없다
      paperMmPerPx: pdf ? pdf.paperMmPerPx : method === 'ratio' && paperMmPerPx ? paperMmPerPx : undefined,
      opacity: 0.7,
      invert: true,
      // 사진은 그림자와 종이색을 걷어내야 선이 잘 보인다. PDF는 이미 깨끗하다.
      enhance: !pdf,
      visible: true,
    });
  };

  const stepNumber = step === 'pick' ? 1 : step === 'corners' ? 2 : 3;

  return (
    <div className="underlay-wizard-overlay">
      <div className="underlay-wizard" role="dialog" aria-modal="true" aria-labelledby="underlay-wizard-title">
        <header className="underlay-wizard-header">
          <h2 id="underlay-wizard-title">바탕 도면 깔기</h2>
          <ol className="underlay-steps" aria-label="진행 단계">
            {['고르기', '반듯하게', '축척'].map((label, i) => (
              <li key={label} className={stepNumber === i + 1 ? 'is-current' : stepNumber > i + 1 ? 'is-done' : ''}>
                <span>{i + 1}</span>{label}
              </li>
            ))}
          </ol>
          <button type="button" className="underlay-wizard-close" onClick={onClose} aria-label="닫기">
            <IconX />
          </button>
        </header>

        {step === 'pick' && (
          <div className="underlay-pick">
            <p className="underlay-pick-lead">종이 도면을 찍거나, 도면 파일을 골라 캔버스 바닥에 깔고 그 위에 헤드를 그려요.</p>
            <div className="underlay-pick-buttons">
              <button type="button" className="underlay-pick-btn" onClick={() => cameraInputRef.current?.click()}>
                <IconCamera />
                <strong>사진 찍기</strong>
                <span>종이 도면을 바로 촬영</span>
              </button>
              <button type="button" className="underlay-pick-btn" onClick={() => fileInputRef.current?.click()}>
                <IconImage />
                <strong>파일 고르기</strong>
                <span>JPG · PNG · PDF</span>
              </button>
            </div>
            <ul className="underlay-pick-tips">
              <li>종이를 평평하게 펴고, 네 모서리가 다 보이게 최대한 정면에서 찍어 주세요.</li>
              <li>치수가 적힌 벽이 하나는 보여야 축척을 맞출 수 있어요.</li>
            </ul>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="underlay-file-input" onChange={handleFile} />
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.pdf" className="underlay-file-input" onChange={handleFile} />
          </div>
        )}

        {step === 'corners' && source && (
          <>
            <PointStage image={source} points={corners} onChange={setCorners} connect="polygon" labels={CORNER_LABELS} />
            <footer className="underlay-wizard-footer">
              <p className="underlay-hint">
                네 점을 끌어 <strong>종이(또는 도면 테두리)의 네 모서리</strong>에 맞추세요. 비스듬히 찍힌 사진을 정면에서 본 것처럼 펴 줍니다.
              </p>
              <div className="underlay-actions">
                <Button size="sm" variant="ghost" icon={<IconRotate />} onClick={handleRotate} disabled={!!busy}>90° 돌리기</Button>
                <span className="underlay-actions-spacer" />
                <Button size="sm" variant="ghost" onClick={() => goToScale(source, 'twoPoint')} disabled={!!busy}>보정 없이 사용</Button>
                <Button size="sm" onClick={handleApplyCorners} disabled={!!busy}>반듯하게 펴기</Button>
              </div>
            </footer>
          </>
        )}

        {step === 'scale' && flat && (
          <>
            {method === 'twoPoint' ? (
              <PointStage image={flat} points={twoPoints} onChange={setTwoPoints} connect="line" labels={TWO_POINT_LABELS} />
            ) : (
              <div className="point-stage underlay-preview">
                <img src={flat.url} alt="" />
              </div>
            )}
            <footer className="underlay-wizard-footer">
              <div className="underlay-method-switch" role="tablist" aria-label="축척 맞추는 방법">
                <button type="button" role="tab" aria-selected={method === 'twoPoint'} className={method === 'twoPoint' ? 'is-active' : ''} onClick={() => setMethod('twoPoint')}>
                  두 점 + 실제 길이
                </button>
                <button type="button" role="tab" aria-selected={method === 'ratio'} className={method === 'ratio' ? 'is-active' : ''} onClick={() => setMethod('ratio')}>
                  축척 1 : N
                </button>
              </div>

              {method === 'twoPoint' ? (
                <>
                  <p className="underlay-hint">
                    치수를 아는 선의 <strong>양 끝에 A·B 점</strong>을 맞추고, 그 선의 실제 길이를 입력하세요. 긴 선일수록 정확해요.
                  </p>
                  <div className="underlay-fields">
                    <div className="field">
                      <label htmlFor="underlay-real-length">A–B 실제 길이 (mm)</label>
                      <input id="underlay-real-length" type="number" inputMode="decimal" min="1" placeholder="예: 8000" value={realLength} onChange={(e) => setRealLength(e.target.value)} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="underlay-hint">
                    {pdf
                      ? '도면에 적힌 축척을 입력하세요. PDF는 종이 크기를 알고 있어 바로 맞춰져요.'
                      : <>그림 전체가 <strong>용지 한 장과 꼭 맞을 때</strong>(스캔본, 또는 종이 모서리에 맞춰 편 사진)만 정확해요. 아니라면 "두 점 + 실제 길이"를 쓰세요.</>}
                  </p>
                  <div className="underlay-fields">
                    {!pdf && (
                      <div className="field">
                        <label htmlFor="underlay-paper">용지 크기</label>
                        <select id="underlay-paper" value={paper} onChange={(e) => setPaper(e.target.value)}>
                          {Object.keys(PAPER_LONG_SIDE_MM).map((key) => <option key={key} value={key}>{key}</option>)}
                          <option value={CUSTOM_PAPER}>직접 입력</option>
                        </select>
                      </div>
                    )}
                    {!pdf && paper === CUSTOM_PAPER && (
                      <div className="field">
                        <label htmlFor="underlay-paper-mm">용지 긴 변 (mm)</label>
                        <input id="underlay-paper-mm" type="number" inputMode="decimal" min="1" placeholder="예: 420" value={customPaperMm} onChange={(e) => setCustomPaperMm(e.target.value)} />
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor="underlay-ratio">축척 1 : N 의 N</label>
                      <input id="underlay-ratio" type="number" inputMode="decimal" min="1" placeholder="예: 100" value={ratio} onChange={(e) => setRatio(e.target.value)} />
                    </div>
                    {pdf && pdf.pageCount > 1 && (
                      <div className="field">
                        <label htmlFor="underlay-page">쪽 (전체 {pdf.pageCount}쪽)</label>
                        <select id="underlay-page" value={pdf.page} disabled={!!busy} onChange={(e) => void loadPdfPage(pdf.file, Number(e.target.value))}>
                          {Array.from({ length: pdf.pageCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}쪽</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </>
              )}

              <p className={`underlay-result ${mmPerPx ? 'is-ready' : ''}`}>
                {mmPerPx
                  ? `그림 전체가 실제로 가로 ${formatMeters(flat.width * mmPerPx)} × 세로 ${formatMeters(flat.height * mmPerPx)} 크기로 깔려요.`
                  : '값을 입력하면 그림이 실제로 얼마나 큰지 여기에 보여 드려요.'}
              </p>

              <div className="underlay-actions">
                <Button size="sm" variant="ghost" onClick={() => setStep(pdf || !source ? 'pick' : 'corners')} disabled={!!busy}>이전</Button>
                <span className="underlay-actions-spacer" />
                <Button size="sm" onClick={handleFinish} disabled={!mmPerPx || !!busy}>도면에 깔기</Button>
              </div>
            </footer>
          </>
        )}

        {error && <p className="underlay-error" role="alert">{error}</p>}
        {busy && <div className="underlay-busy" role="status">{busy}</div>}
      </div>
    </div>
  );
}
