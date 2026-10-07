import jsPDF from 'jspdf';
import type { Layer, Shape, Underlay } from '../types/cad';
import { renderForPrint } from './imageWarp';
import { computeSprinklerCoveragePolygon, DEFAULT_LINE_THICKNESS_MM, formatMeters, getBounds, TEXT_FONT_SIZE_MM } from './geometry';
import type { ReviewResult } from './review';
import { toFileBaseName } from './storage';

export interface ExportOptions {
  name: string;
  shapes: Shape[];
  layers: Layer[];
  review: ReviewResult;
  /** 화면에서 미방호 구역 표시를 켜 두었으면 인쇄본에도 함께 칠한다 */
  showUncovered: boolean;
  /** 바탕 도면 — 화면에서 보이게 해 두었으면 인쇄본 바닥에도 깐다 */
  underlay: Underlay | null;
}

/** 인쇄본에서 바탕 도면의 진하기 — 그 위에 그린 헤드와 글자가 묻히지 않을 만큼만 옅게 */
const PRINT_UNDERLAY_OPACITY = 0.6;

/*
 * 인쇄용 도면 한 장(A4 가로)의 배치. 단위는 모두 종이 위 mm.
 * 왼쪽 큰 칸에 도면, 오른쪽에 수량·검토·범례, 아래에 표제란을 둔다.
 */
const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 8;
const SIDE_W = 62;
const TITLE_H = 15;
const AREA_X = MARGIN;
const AREA_Y = MARGIN;
const AREA_W = PAGE_W - MARGIN * 2 - SIDE_W;
const AREA_H = PAGE_H - MARGIN * 2 - TITLE_H;
/** 도면이 칸 테두리와 라벨에 닿지 않도록 사방에 두는 여백 */
const AREA_PADDING = 9;
/** 종이 1mm를 몇 px로 래스터화할지 — A4 기준 약 200dpi */
const PX_PER_MM = 8;

/** 도면이 칸에 들어가는 가장 큰 축척을 이 목록에서 고른다 (1:N) */
const SCALE_STEPS = [10, 20, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 5000];

const INK = '#1a1a1a';
const INK_SUB = '#555555';
const RULE = '#9a9a9a';
const UNCOVERED_COLOR = '#E5484D';
const FONT_STACK = "'Poppins', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 어두운 화면용 레이어 색을 흰 종이에서 읽히는 색으로 바꾼다 — 옅은 회색(벽체)은 검정에 가깝게, 나머지는 조금 어둡게 */
function printColor(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return INK;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const isGray = Math.max(r, g, b) - Math.min(r, g, b) < 24;
  const factor = isGray ? 0.15 : 0.78;
  const to = (v: number) => Math.round(v * factor).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function pickScale(widthMm: number, heightMm: number): number {
  const availW = AREA_W - AREA_PADDING * 2;
  const availH = AREA_H - AREA_PADDING * 2;
  return SCALE_STEPS.find((n) => widthMm / n <= availW && heightMm / n <= availH) ?? SCALE_STEPS[SCALE_STEPS.length - 1];
}

/** 도면 칸에 들어갈 SVG를 직접 조립한다 — 화면 캔버스(어두운 배경·편집용 표시)와 달리 흰 종이에 맞춘 색과 굵기를 쓴다 */
function buildDrawingSvg(options: ExportOptions, scale: number, centerX: number, centerY: number, underlayDataUrl: string | null): string {
  const { shapes, layers, review, showUncovered } = options;
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const visible = shapes.filter((s) => layerMap.get(s.layer)?.visible !== false);
  const obstacles = visible.filter((s) => {
    const category = layerMap.get(s.layer)?.category;
    return category === 'wall' || category === 'column';
  });

  /** 종이 위 mm → 도면 mm */
  const paper = (mm: number) => mm * scale;
  const viewW = paper(AREA_W);
  const viewH = paper(AREA_H);
  const outline = paper(0.3);
  const fontLabel = paper(2.5);
  const fontDim = paper(2.2);
  const gap = paper(2.2);
  const parts: string[] = [];
  const text = (x: number, y: number, content: string, size: number, fill: string, anchor = 'middle', weight = 500) => (
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central">${escapeXml(content)}</text>`
  );

  const { underlay } = options;
  if (underlay && underlayDataUrl) {
    parts.push(`<image href="${underlayDataUrl}" x="${underlay.origin.x}" y="${underlay.origin.y}" width="${underlay.widthPx * underlay.mmPerPx}" height="${underlay.heightPx * underlay.mmPerPx}" preserveAspectRatio="none" opacity="${PRINT_UNDERLAY_OPACITY}"/>`);
  }

  if (showUncovered) {
    for (const r of review.uncoveredRects) {
      parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${UNCOVERED_COLOR}" fill-opacity="0.28"/>`);
    }
  }

  // 방호범위 → 도형 → 글자 순으로 쌓아, 옅은 방호범위가 벽이나 라벨을 가리지 않게 한다
  const labels: string[] = [];
  const bodies: string[] = [];
  for (const shape of visible) {
    const color = printColor(layerMap.get(shape.layer)?.color ?? INK);
    const category = layerMap.get(shape.layer)?.category;

    if (shape.kind === 'line') {
      const hasThickness = shape.thicknessMm !== undefined;
      const width = Math.max(shape.thicknessMm ?? DEFAULT_LINE_THICKNESS_MM, paper(0.45));
      bodies.push(`<line x1="${shape.start.x}" y1="${shape.start.y}" x2="${shape.end.x}" y2="${shape.end.y}" stroke="${color}" stroke-width="${width}" stroke-linecap="${hasThickness ? 'butt' : 'round'}" stroke-opacity="${hasThickness ? 0.55 : 1}"/>`);
      const dx = shape.end.x - shape.start.x;
      const dy = shape.end.y - shape.start.y;
      const len = Math.hypot(dx, dy) || 1;
      if (len >= paper(9)) {
        const offset = width / 2 + gap;
        labels.push(text((shape.start.x + shape.end.x) / 2 + (-dy / len) * offset, (shape.start.y + shape.end.y) / 2 + (dx / len) * offset, formatMeters(Math.abs(shape.lengthMm)), fontDim, INK_SUB));
      }
    } else if (shape.kind === 'rect') {
      const x = shape.center.x - shape.widthMm / 2;
      const y = shape.center.y - shape.heightMm / 2;
      bodies.push(`<rect x="${x}" y="${y}" width="${shape.widthMm}" height="${shape.heightMm}" fill="${color}" fill-opacity="${category === 'column' ? 0.45 : 0.04}" stroke="${color}" stroke-width="${outline}"/>`);
      if (shape.label) labels.push(text(shape.center.x, y - gap, shape.label, fontLabel, INK));
      else labels.push(text(shape.center.x, y + shape.heightMm + gap, `${formatMeters(shape.widthMm)} × ${formatMeters(shape.heightMm)}`, fontDim, INK_SUB));
    } else if (shape.kind === 'text') {
      labels.push(text(shape.position.x, shape.position.y, shape.text, Math.max(TEXT_FONT_SIZE_MM, paper(2.2)), color));
    } else if (shape.kind === 'arc') {
      const startRad = (shape.startAngleDeg * Math.PI) / 180;
      const endRad = (shape.endAngleDeg * Math.PI) / 180;
      const sx = shape.center.x + shape.radiusMm * Math.cos(startRad);
      const sy = shape.center.y - shape.radiusMm * Math.sin(startRad);
      const ex = shape.center.x + shape.radiusMm * Math.cos(endRad);
      const ey = shape.center.y - shape.radiusMm * Math.sin(endRad);
      const largeArc = shape.endAngleDeg - shape.startAngleDeg > 180 ? 1 : 0;
      bodies.push(`<path d="M ${sx} ${sy} A ${shape.radiusMm} ${shape.radiusMm} 0 ${largeArc} 0 ${ex} ${ey}" fill="none" stroke="${color}" stroke-width="${Math.max(DEFAULT_LINE_THICKNESS_MM, paper(0.45))}"/>`);
    } else if (shape.sprinklerHead) {
      const polygon = computeSprinklerCoveragePolygon(shape.center, shape.radiusMm, obstacles, shape.id);
      parts.push(`<polygon points="${polygon.map((p) => `${p.x},${p.y}`).join(' ')}" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-width="${paper(0.2)}" stroke-dasharray="${paper(1.4)} ${paper(1)}" stroke-linejoin="round"/>`);
      bodies.push(`<circle cx="${shape.center.x}" cy="${shape.center.y}" r="${paper(0.9)}" fill="${color}"/>`);
      const caption = shape.label ? `${shape.label} · R${formatMeters(shape.radiusMm)}` : `R${formatMeters(shape.radiusMm)}`;
      labels.push(text(shape.center.x, shape.center.y - gap - paper(0.6), caption, fontLabel, INK));
    } else {
      bodies.push(`<circle cx="${shape.center.x}" cy="${shape.center.y}" r="${shape.radiusMm}" fill="${color}" fill-opacity="${category === 'column' ? 0.45 : 0.08}" stroke="${color}" stroke-width="${outline}"/>`);
      if (shape.label) labels.push(text(shape.center.x, shape.center.y - shape.radiusMm - gap, shape.label, fontLabel, INK));
      else labels.push(text(shape.center.x, shape.center.y - shape.radiusMm - gap, `R${formatMeters(shape.radiusMm)}`, fontDim, INK_SUB));
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${AREA_W * PX_PER_MM}" height="${AREA_H * PX_PER_MM}" viewBox="${centerX - viewW / 2} ${centerY - viewH / 2} ${viewW} ${viewH}" font-family="${FONT_STACK.replace(/'/g, '&apos;')}">`,
    ...parts,
    ...bodies,
    ...labels,
    '</svg>',
  ].join('');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('도면 이미지를 불러오지 못했습니다.'));
    image.src = src;
  });
}

/** 실제 길이 감을 잡기 위한 축척 막대 — 종이 위에서 15~40mm쯤 되는 딱 떨어지는 길이를 고른다 */
function pickScaleBarMm(scale: number): number {
  const candidates = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  return candidates.find((mm) => mm / scale >= 15) ?? candidates[candidates.length - 1];
}

/**
 * 인쇄용 도면 한 장을 캔버스에 그린다 — 흰 배경, 도면 + 수량표·방호 검토·범례 + 표제란(도면명·축척·날짜).
 * 한글 글꼴을 PDF에 심는 대신 통째로 이미지로 만들어 어느 환경에서 열어도 글자가 깨지지 않게 한다.
 */
export async function renderDrawingSheet(options: ExportOptions): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const { name, shapes, layers, review, showUncovered } = options;
  const underlay = options.underlay?.visible ? options.underlay : null;
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const visible = shapes.filter((s) => layerMap.get(s.layer)?.visible !== false);
  const bounds = getBounds(visible);
  if (underlay) {
    // 바탕 도면 전체가 종이에 들어가도록 범위를 넓힌다 (도형이 하나도 없으면 바탕 도면만으로 범위를 잡는다)
    const right = underlay.origin.x + underlay.widthPx * underlay.mmPerPx;
    const bottom = underlay.origin.y + underlay.heightPx * underlay.mmPerPx;
    if (visible.length === 0) {
      Object.assign(bounds, { minX: underlay.origin.x, minY: underlay.origin.y, maxX: right, maxY: bottom });
    } else {
      bounds.minX = Math.min(bounds.minX, underlay.origin.x);
      bounds.minY = Math.min(bounds.minY, underlay.origin.y);
      bounds.maxX = Math.max(bounds.maxX, right);
      bounds.maxY = Math.max(bounds.maxY, bottom);
    }
  }
  const scale = pickScale(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  await document.fonts.ready;
  const underlayDataUrl = underlay ? await renderForPrint(underlay.blob, underlay.widthPx, underlay.heightPx, underlay.enhance) : null;
  const svg = buildDrawingSvg({ ...options, underlay }, scale, (bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, underlayDataUrl);
  const drawingImage = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * PX_PER_MM;
  canvas.height = PAGE_H * PX_PER_MM;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');
  ctx.scale(PX_PER_MM, PX_PER_MM);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.drawImage(drawingImage, AREA_X, AREA_Y, AREA_W, AREA_H);
  ctx.textBaseline = 'middle';

  const setFont = (sizeMm: number, weight = 400) => { ctx.font = `${weight} ${sizeMm}px ${FONT_STACK}`; };
  const line = (x1: number, y1: number, x2: number, y2: number, width = 0.2, color = RULE) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  /** 칸 너비를 넘는 글자는 줄여서 말줄임표를 붙인다 */
  const fitText = (content: string, maxWidth: number): string => {
    if (ctx.measureText(content).width <= maxWidth) return content;
    let cut = content;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  };
  /** 긴 문장을 칸 너비에 맞춰 여러 줄로 나눈다 (한글은 띄어쓰기가 드물어 글자 단위로 끊는다) */
  const wrapText = (content: string, maxWidth: number): string[] => {
    const lines: string[] = [];
    let current = '';
    for (const ch of content) {
      if (ctx.measureText(current + ch).width > maxWidth && current) {
        lines.push(current);
        current = ch.trimStart();
      } else {
        current += ch;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // ── 축척 막대 (도면 칸 왼쪽 아래) ──
  const barMm = pickScaleBarMm(scale);
  const barLen = barMm / scale;
  const barX = AREA_X + 5;
  const barY = AREA_Y + AREA_H - 5;
  line(barX, barY, barX + barLen, barY, 0.4, INK);
  line(barX, barY - 1.2, barX, barY + 1.2, 0.4, INK);
  line(barX + barLen, barY - 1.2, barX + barLen, barY + 1.2, 0.4, INK);
  setFont(2.4, 500);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText(formatMeters(barMm), barX + barLen / 2, barY - 2.6);

  // ── 오른쪽 칸: 수량 · 방호 검토 · 범례 ──
  const sideX = AREA_X + AREA_W;
  const sideInnerX = sideX + 4;
  const sideInnerW = SIDE_W - 8;
  const sideBottom = AREA_Y + AREA_H;
  let y = AREA_Y + 6;

  const heading = (title: string) => {
    setFont(3, 700);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText(title, sideInnerX, y);
    y += 3.2;
    line(sideInnerX, y, sideInnerX + sideInnerW, y, 0.25, INK);
    y += 4.2;
  };
  const row = (label: string, value: string, valueColor = INK) => {
    setFont(2.6, 400);
    ctx.fillStyle = INK_SUB;
    ctx.textAlign = 'left';
    ctx.fillText(label, sideInnerX, y);
    setFont(2.6, 600);
    ctx.fillStyle = valueColor;
    ctx.textAlign = 'right';
    ctx.fillText(value, sideInnerX + sideInnerW, y);
    y += 5;
  };

  heading('수량');
  row('스프링클러 헤드', `${review.quantities.headCount}개`);
  row('기둥', `${review.quantities.columnCount}개`);
  row('벽체 길이', formatMeters(review.quantities.wallLengthMm));
  row('보', `${review.quantities.beamCount}개 · ${formatMeters(review.quantities.beamLengthMm)}`);
  y += 3;

  heading('방호 검토');
  if (review.hasRoom) {
    row('실 면적', `${review.roomAreaM2}㎡`);
    row('방호율', `${review.coveragePct}%`);
    row('미방호 면적', `${review.uncoveredAreaM2}㎡`, review.uncoveredAreaM2 > 0 ? UNCOVERED_COLOR : INK);
  } else {
    setFont(2.4, 400);
    ctx.fillStyle = INK_SUB;
    ctx.textAlign = 'left';
    for (const text of wrapText('벽체로 둘러싸인 공간이 없어 면적을 계산하지 않았습니다.', sideInnerW)) {
      ctx.fillText(text, sideInnerX, y);
      y += 3.6;
    }
    y += 1.4;
  }

  // 범례가 들어갈 자리를 남기고, 남는 높이만큼만 경고를 적는다
  const legendRows = layers.filter((l) => l.visible).length + (showUncovered && review.uncoveredRects.length > 0 ? 1 : 0);
  const legendHeight = 7.4 + legendRows * 5 + 4;
  const warningLimitY = sideBottom - legendHeight - 4;
  setFont(2.3, 400);
  ctx.textAlign = 'left';
  let hiddenWarnings = 0;
  if (review.warnings.length === 0) {
    ctx.fillStyle = INK_SUB;
    ctx.fillText(review.quantities.headCount > 0 ? '간격·이격 경고 없음' : '헤드 없음', sideInnerX, y);
    y += 4;
  }
  for (const [index, warning] of review.warnings.entries()) {
    const lines = wrapText(`· ${warning.message}`, sideInnerW);
    if (y + lines.length * 3.4 > warningLimitY) {
      hiddenWarnings = review.warnings.length - index;
      break;
    }
    ctx.fillStyle = INK;
    for (const text of lines) {
      ctx.fillText(text, sideInnerX, y);
      y += 3.4;
    }
    y += 1;
  }
  if (hiddenWarnings > 0) {
    ctx.fillStyle = INK_SUB;
    ctx.fillText(`외 ${hiddenWarnings}건`, sideInnerX, y);
  }

  y = sideBottom - legendHeight + 3;
  heading('범례');
  setFont(2.6, 400);
  for (const layer of layers.filter((l) => l.visible)) {
    ctx.fillStyle = printColor(layer.color);
    ctx.fillRect(sideInnerX, y - 1.3, 5, 2.6);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText(fitText(layer.name, sideInnerW - 8), sideInnerX + 8, y);
    y += 5;
  }
  if (showUncovered && review.uncoveredRects.length > 0) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = UNCOVERED_COLOR;
    ctx.fillRect(sideInnerX, y - 1.3, 5, 2.6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.fillText('미방호 구역', sideInnerX + 8, y);
  }

  // ── 표제란 ──
  const titleY = AREA_Y + AREA_H;
  const titleMid = titleY + TITLE_H / 2;
  const cells = [
    { label: '도면명', value: name, width: PAGE_W - MARGIN * 2 - 150, bold: true },
    { label: '축척', value: `1 : ${scale}`, width: 34 },
    { label: '작성일', value: new Date().toLocaleDateString('ko-KR'), width: 46 },
    { label: '작성 도구', value: 'Smart Sprinkler CAD', width: 70 },
  ];
  let cellX = MARGIN;
  for (const [index, cell] of cells.entries()) {
    if (index > 0) line(cellX, titleY, cellX, titleY + TITLE_H, 0.25, INK);
    setFont(2.2, 400);
    ctx.fillStyle = INK_SUB;
    ctx.textAlign = 'left';
    ctx.fillText(cell.label, cellX + 3, titleMid - 3.2);
    setFont(cell.bold ? 4.2 : 3.2, cell.bold ? 700 : 600);
    ctx.fillStyle = INK;
    ctx.fillText(fitText(cell.value, cell.width - 6), cellX + 3, titleMid + 2.2);
    cellX += cell.width;
  }

  // ── 테두리 ──
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.4;
  ctx.strokeRect(MARGIN, MARGIN, PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2);
  line(sideX, AREA_Y, sideX, titleY, 0.25, INK);
  line(MARGIN, titleY, PAGE_W - MARGIN, titleY, 0.25, INK);

  return { canvas, scale };
}

/** 인쇄용 도면을 A4 가로 PDF 한 장으로 저장한다 */
export async function exportDrawingAsPdf(options: ExportOptions): Promise<void> {
  const { canvas } = await renderDrawingSheet(options);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, PAGE_W, PAGE_H);
  const dateStamp = new Date().toISOString().slice(0, 10);
  pdf.save(`${toFileBaseName(options.name)}_${dateStamp}.pdf`);
}
