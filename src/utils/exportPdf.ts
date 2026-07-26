import jsPDF from 'jspdf';
import type { Shape } from '../types/cad';
import { getBounds } from './geometry';

/** 도면 범위 바깥 여백(mm) — 화면의 baseView 패딩과 동일 */
const EXPORT_PADDING_MM = 800;
/** 래스터 캔버스 최대 변 길이(px) — 너무 크면 브라우저 메모리를 과하게 쓴다 */
const MAX_RASTER_PX = 2600;
/** tokens.css의 --bg와 동일 — 내보낸 SVG는 독립 문서라 CSS 변수를 못 읽으므로 값을 직접 박아 넣는다 */
const CANVAS_BG = '#121212';
/** 인쇄에는 필요 없는 편집 전용 요소(가이드 점, 배경 격자, 미리보기/선택 마커 등) */
const STRIP_SELECTORS = ['.cad-pending', '.cad-draw-preview', '.cad-snap-marker', '.cad-marquee', '.cad-guide-dot', '.cad-grid-bg'];

const STYLE_PROPS = [
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
  'fill-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
];

/**
 * source 트리와 구조가 같은 clone 트리를 나란히 순회하며 최종 계산된 스타일을 clone에 인라인으로 박아 넣는다.
 * 내보낸 SVG는 원본 문서의 외부 스타일시트·CSS 변수에 접근할 수 없는 독립된 컨텍스트에서 그려지므로,
 * 이렇게 미리 값을 확정해두지 않으면 색상·굵기 등이 깨진다.
 */
function inlineComputedStyles(source: Element, clone: Element) {
  const computed = window.getComputedStyle(source);
  const style = (clone as unknown as SVGElement).style;
  for (const prop of STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (value) style.setProperty(prop, value);
  }
  for (let i = 0; i < source.children.length; i++) {
    const child = source.children[i];
    const cloneChild = clone.children[i];
    if (child && cloneChild) inlineComputedStyles(child, cloneChild);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('도면 이미지를 불러오지 못했습니다.'));
    image.src = src;
  });
}

/** 캔버스 SVG를 현재 화면의 확대/이동 상태가 아니라 도형 전체 범위 기준으로 잘라 PDF로 저장한다 */
export async function exportDrawingAsPdf(svg: SVGSVGElement, shapes: Shape[], fileName: string): Promise<void> {
  const bounds = getBounds(shapes);
  const contentWidth = bounds.maxX - bounds.minX + EXPORT_PADDING_MM * 2;
  const contentHeight = bounds.maxY - bounds.minY + EXPORT_PADDING_MM * 2;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);
  clone.setAttribute('viewBox', `${bounds.minX - EXPORT_PADDING_MM} ${bounds.minY - EXPORT_PADDING_MM} ${contentWidth} ${contentHeight}`);
  clone.setAttribute('width', String(contentWidth));
  clone.setAttribute('height', String(contentHeight));
  clone.querySelectorAll(STRIP_SELECTORS.join(',')).forEach((el) => el.remove());

  const svgString = new XMLSerializer().serializeToString(clone);
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  const image = await loadImage(svgDataUrl);

  const scale = Math.min(MAX_RASTER_PX / contentWidth, MAX_RASTER_PX / contentHeight);
  const pxWidth = Math.round(contentWidth * scale);
  const pxHeight = Math.round(contentHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = pxWidth;
  canvas.height = pxHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, pxWidth, pxHeight);
  ctx.drawImage(image, 0, 0, pxWidth, pxHeight);
  // 도면은 선/글자 위주라 PNG보다 JPEG가 화질 저하 없이 용량을 훨씬 크게 줄여준다 (배경이 단색이라 블록 노이즈도 눈에 덜 띔)
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);

  const isLandscape = contentWidth >= contentHeight;
  const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const fitScale = Math.min((pageWidth - margin * 2) / pxWidth, (pageHeight - margin * 2) / pxHeight);
  const drawWidth = pxWidth * fitScale;
  const drawHeight = pxHeight * fitScale;

  pdf.addImage(jpegDataUrl, 'JPEG', (pageWidth - drawWidth) / 2, (pageHeight - drawHeight) / 2, drawWidth, drawHeight);
  pdf.save(fileName);
}
