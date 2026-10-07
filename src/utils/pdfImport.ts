import type { LoadedImage } from './imageWarp';

/** PDF 한 쪽을 그림으로 바꾼 결과 — 종이 크기를 알기 때문에 "1:N" 축척을 바로 쓸 수 있다 */
export interface PdfPageImage extends LoadedImage {
  pageCount: number;
  /** 그림 1px이 종이에서 몇 mm인지 */
  paperMmPerPx: number;
}

/** PDF 좌표 단위(pt, 1/72인치)를 mm로 */
const MM_PER_PT = 25.4 / 72;
/** 그림으로 바꿀 때 긴 변의 목표 크기(px) — 도면의 가는 선과 작은 글자가 뭉개지지 않을 만큼 */
const TARGET_LONG_SIDE_PX = 2400;
/** 한 쪽을 그리는 데 이보다 오래 걸리면 멈추고 알린다 (끝없이 기다리게 두지 않는다) */
const RENDER_TIMEOUT_MS = 30000;

/**
 * PDF의 한 쪽을 JPEG 그림으로 바꾼다.
 * PDF를 읽는 라이브러리는 용량이 커서, 실제로 PDF를 고른 순간에만 내려받도록 여기서 불러온다.
 */
export async function renderPdfPage(file: Blob, pageNumber: number): Promise<PdfPageImage> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
    const base = page.getViewport({ scale: 1 });
    const scale = TARGET_LONG_SIDE_PX / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 'print' 방식은 화면 갱신 주기(애니메이션 프레임)를 기다리지 않고 그린다 — 탭이 뒤에 가려져 있어도 멈추지 않는다
    const renderTask = page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' });
    let timer = 0;
    try {
      await Promise.race([
        renderTask.promise,
        new Promise<never>((_, reject) => {
          timer = window.setTimeout(() => {
            renderTask.cancel();
            reject(new Error('PDF를 그리는 데 너무 오래 걸려요. 쪽 수가 적은 파일이나 그림 파일로 다시 시도해 주세요.'));
          }, RENDER_TIMEOUT_MS);
        }),
      ]);
    } finally {
      window.clearTimeout(timer);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF를 그림으로 바꾸지 못했습니다.'))), 'image/jpeg', 0.9);
    });
    return {
      url: URL.createObjectURL(blob),
      blob,
      width: canvas.width,
      height: canvas.height,
      pageCount: pdf.numPages,
      paperMmPerPx: (base.width * MM_PER_PT) / canvas.width,
    };
  } finally {
    await loadingTask.destroy();
  }
}
