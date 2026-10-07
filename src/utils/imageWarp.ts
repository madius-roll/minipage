import type { Point } from '../types/cad';

/** 불러온 그림 한 장 — 화면에 보여줄 임시 주소와 저장용 blob, 픽셀 크기 */
export interface LoadedImage {
  url: string;
  blob: Blob;
  width: number;
  height: number;
}

/** 폰 사진은 한 변이 4000px을 넘기도 한다 — 불러올 때 이 크기로 줄여 메모리와 처리 시간을 아낀다 */
const MAX_SOURCE_PX = 2800;
/** 원근 보정을 마친 결과 이미지의 긴 변 최대 크기 */
const MAX_OUTPUT_PX = 2200;
const JPEG_QUALITY = 0.86;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다.'))), 'image/jpeg', JPEG_QUALITY);
  });
}

async function finishCanvas(canvas: HTMLCanvasElement): Promise<LoadedImage> {
  const blob = await canvasToBlob(canvas);
  return { url: URL.createObjectURL(blob), blob, width: canvas.width, height: canvas.height };
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');
  // 투명한 PNG를 JPEG로 바꾸면 투명 부분이 검게 나오므로 흰 바탕을 먼저 깐다
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열지 못했습니다.')); };
    image.src = url;
  });
}

/** 사진·이미지 파일을 읽어 다루기 좋은 크기의 JPEG로 정리한다 (폰 사진의 회전 정보는 브라우저가 반영해 준다) */
export async function loadImageFile(file: Blob): Promise<LoadedImage> {
  const image = await decodeImage(file);
  const ratio = Math.min(1, MAX_SOURCE_PX / Math.max(image.naturalWidth, image.naturalHeight));
  const { canvas, ctx } = makeCanvas(image.naturalWidth * ratio, image.naturalHeight * ratio);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return finishCanvas(canvas);
}

/** 시계 방향으로 90° 돌린다 (옆으로 눕혀 찍은 도면 바로 세우기) */
export async function rotateImage90(source: LoadedImage): Promise<LoadedImage> {
  const image = await decodeImage(source.blob);
  const { canvas, ctx } = makeCanvas(source.height, source.width);
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(image, 0, 0);
  return finishCanvas(canvas);
}

/** 8×8 연립방정식을 가우스 소거법으로 푼다 — 네 점 대응으로 원근 변환 행렬을 구할 때 쓴다 */
function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/** from의 네 점을 to의 네 점으로 보내는 원근 변환(호모그래피)의 계수 8개 */
function homography(from: Point[], to: Point[]): number[] | null {
  const matrix: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }
  return solveLinear(matrix, rhs);
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

type Vec3 = [number, number, number];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * 비스듬히 찍힌 사각형의 실제 가로:세로 비율을 추정한다 (Zhang·He의 화이트보드 스캔 방식).
 * 사진 속 네 모서리만으로는 변 길이를 그대로 믿을 수 없다 — 멀리 있는 변이 짧게 찍히기 때문이다.
 * 대신 "카메라 렌즈의 중심이 사진 한가운데에 있다"고 가정하면 초점거리와 종이의 기울기를 풀어낼 수 있고, 거기서 진짜 비율이 나온다.
 * 거의 정면에서 찍어 원근이 없거나 계산이 불안정하면 null을 돌려주고, 그때는 변 길이 평균을 쓴다.
 */
function estimateAspectRatio(corners: Point[], imageWidth: number, imageHeight: number): number | null {
  const [tl, tr, br, bl] = corners;
  const u0 = imageWidth / 2;
  const v0 = imageHeight / 2;
  const m1: Vec3 = [tl.x, tl.y, 1];
  const m2: Vec3 = [tr.x, tr.y, 1];
  const m3: Vec3 = [bl.x, bl.y, 1];
  const m4: Vec3 = [br.x, br.y, 1];

  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
  const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
  if (!Number.isFinite(k2) || !Number.isFinite(k3)) return null;
  const n2: Vec3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3: Vec3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];

  // 마주보는 변이 사진에서도 평행하면(원근이 거의 없으면) 초점거리를 풀 수 없다 — 이때는 변 길이 비율이 곧 실제 비율이다
  const PARALLEL_EPSILON = 1e-4;
  if (Math.abs(n2[2]) < PARALLEL_EPSILON || Math.abs(n3[2]) < PARALLEL_EPSILON) {
    const ratio = Math.sqrt((n2[0] ** 2 + n2[1] ** 2) / (n3[0] ** 2 + n3[1] ** 2));
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  }

  const focalSq = -(
    (n2[0] * n3[0] - (n2[0] * n3[2] + n2[2] * n3[0]) * u0 + n2[2] * n3[2] * u0 * u0)
    + (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * v0 + n2[2] * n3[2] * v0 * v0)
  ) / (n2[2] * n3[2]);
  if (!(focalSq > 0)) return null;

  const lengthSq = (n: Vec3) => ((n[0] - u0 * n[2]) ** 2 + (n[1] - v0 * n[2]) ** 2) / focalSq + n[2] ** 2;
  const ratio = Math.sqrt(lengthSq(n2) / lengthSq(n3));
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/**
 * 비스듬히 찍힌 종이를 정면에서 본 직사각형으로 편다.
 * corners는 원본 이미지 위의 네 모서리(px) — 좌상단, 우상단, 우하단, 좌하단 순서.
 * 결과의 가로세로 비율은 원근을 풀어 추정한 실제 비율을 쓰고, 추정할 수 없으면 마주보는 변 길이의 평균으로 잡는다.
 */
export async function warpToRectangle(source: LoadedImage, corners: Point[]): Promise<LoadedImage> {
  const [tl, tr, br, bl] = corners;
  const avgW = (dist(tl, tr) + dist(bl, br)) / 2;
  const avgH = (dist(tl, bl) + dist(tr, br)) / 2;
  // 추정한 비율이 변 길이 평균과 터무니없이 다르면(모서리를 잘못 찍었거나 잘린 사진) 믿지 않는다
  const estimated = estimateAspectRatio(corners, source.width, source.height);
  const aspect = estimated && estimated / (avgW / avgH) > 0.6 && estimated / (avgW / avgH) < 1.67 ? estimated : avgW / avgH;
  // 넓이가 평균 변 길이로 잡은 것과 비슷하도록 크기를 정한다
  const area = avgW * avgH;
  const rawW = Math.sqrt(area * aspect);
  const rawH = Math.sqrt(area / aspect);
  const ratio = Math.min(1, MAX_OUTPUT_PX / Math.max(rawW, rawH));
  const outW = Math.max(2, Math.round(rawW * ratio));
  const outH = Math.max(2, Math.round(rawH * ratio));

  // 결과의 각 픽셀이 원본의 어디에서 오는지를 구해야 하므로 "결과 → 원본" 방향의 변환을 쓴다
  const h = homography(
    [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
    [tl, tr, br, bl],
  );
  if (!h) throw new Error('네 모서리가 한 줄에 놓여 있어 보정할 수 없습니다.');

  const image = await decodeImage(source.blob);
  const src = makeCanvas(source.width, source.height);
  src.ctx.drawImage(image, 0, 0, source.width, source.height);
  const srcData = src.ctx.getImageData(0, 0, source.width, source.height).data;

  const out = makeCanvas(outW, outH);
  const outImage = out.ctx.createImageData(outW, outH);
  const dst = outImage.data;
  const maxX = source.width - 1;
  const maxY = source.height - 1;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = h[6] * x + h[7] * y + 1;
      const sx = Math.min(maxX, Math.max(0, (h[0] * x + h[1] * y + h[2]) / w));
      const sy = Math.min(maxY, Math.max(0, (h[3] * x + h[4] * y + h[5]) / w));
      // 주변 네 픽셀을 거리 비율로 섞어(쌍선형 보간) 계단 현상을 줄인다
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(maxX, x0 + 1);
      const y1 = Math.min(maxY, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * source.width + x0) * 4;
      const i10 = (y0 * source.width + x1) * 4;
      const i01 = (y1 * source.width + x0) * 4;
      const i11 = (y1 * source.width + x1) * 4;
      const o = (y * outW + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = srcData[i00 + ch] * (1 - fx) + srcData[i10 + ch] * fx;
        const bottom = srcData[i01 + ch] * (1 - fx) + srcData[i11 + ch] * fx;
        dst[o + ch] = top * (1 - fy) + bottom * fy;
      }
      dst[o + 3] = 255;
    }
  }
  out.ctx.putImageData(outImage, 0, 0);
  return finishCanvas(out.canvas);
}

/** 저장된 blob에서 다시 화면용 이미지를 만든다 (크기는 저장해 둔 값을 그대로 쓴다) */
export function imageFromBlob(blob: Blob, width: number, height: number): LoadedImage {
  return { url: URL.createObjectURL(blob), blob, width, height };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * 인쇄용: 바탕 도면에 흑백·대비 보정을 구워 넣은 data URL을 만든다.
 * 인쇄는 흰 종이에 하므로 화면에서 반전해 보던 그림도 반전하지 않은 원래 모습으로 넣는다.
 */
export async function renderForPrint(blob: Blob, width: number, height: number, enhance: boolean): Promise<string> {
  const image = await decodeImage(blob);
  const { canvas, ctx } = makeCanvas(width, height);
  if (enhance) ctx.filter = 'grayscale(1) contrast(1.35)';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
