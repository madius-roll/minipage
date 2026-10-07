import type { Layer, LayerCategory, Point, Shape } from '../types/cad';

/** 브라우저에 자동 저장되고, 파일로 내보내고 불러오는 도면 한 장 */
export interface DrawingFile {
  version: 1;
  name: string;
  layers: Layer[];
  shapes: Shape[];
  savedAt: string;
}

const STORAGE_KEY = 'minicad:drawing:v1';
export const DEFAULT_DRAWING_NAME = '새 도면';
export const DRAWING_FILE_EXTENSION = '.minicad.json';

const CATEGORIES: LayerCategory[] = ['wall', 'beam', 'column', 'sprinkler', 'etc'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPoint = (v: unknown): v is Point => isRecord(v) && isNum(v.x) && isNum(v.y);

function parseLayer(raw: unknown): Layer | null {
  if (!isRecord(raw)) return null;
  const { id, name, category, color, visible } = raw;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof color !== 'string') return null;
  if (!CATEGORIES.includes(category as LayerCategory)) return null;
  return { id, name, category: category as LayerCategory, color, visible: visible !== false };
}

function parseShape(raw: unknown, layerIds: Set<string>): Shape | null {
  if (!isRecord(raw)) return null;
  const { id, layer, kind } = raw;
  if (typeof id !== 'string' || typeof layer !== 'string' || !layerIds.has(layer)) return null;
  const label = typeof raw.label === 'string' ? raw.label : undefined;

  if (kind === 'line') {
    if (!isPoint(raw.start) || !isPoint(raw.end) || !isNum(raw.lengthMm) || !isNum(raw.angleDeg)) return null;
    const thicknessMm = isNum(raw.thicknessMm) && raw.thicknessMm > 0 ? raw.thicknessMm : undefined;
    return { id, layer, kind, start: raw.start, end: raw.end, lengthMm: raw.lengthMm, angleDeg: raw.angleDeg, thicknessMm };
  }
  if (kind === 'circle') {
    if (!isPoint(raw.center) || !isNum(raw.radiusMm) || raw.radiusMm <= 0) return null;
    return { id, layer, kind, center: raw.center, radiusMm: raw.radiusMm, label, sprinklerHead: raw.sprinklerHead === true ? true : undefined };
  }
  if (kind === 'rect') {
    if (!isPoint(raw.center) || !isNum(raw.widthMm) || !isNum(raw.heightMm) || raw.widthMm <= 0 || raw.heightMm <= 0) return null;
    return { id, layer, kind, center: raw.center, widthMm: raw.widthMm, heightMm: raw.heightMm, label };
  }
  if (kind === 'text') {
    if (!isPoint(raw.position) || typeof raw.text !== 'string') return null;
    return { id, layer, kind, position: raw.position, text: raw.text };
  }
  if (kind === 'arc') {
    if (!isPoint(raw.center) || !isNum(raw.radiusMm) || !isNum(raw.startAngleDeg) || !isNum(raw.endAngleDeg)) return null;
    return { id, layer, kind, center: raw.center, radiusMm: raw.radiusMm, startAngleDeg: raw.startAngleDeg, endAngleDeg: raw.endAngleDeg };
  }
  return null;
}

/** 저장소·파일에서 읽은 값을 검증해 도면으로 만든다. 형식이 맞지 않으면 null, 일부 도형만 깨졌으면 그 도형만 버린다 */
export function parseDrawing(raw: unknown): DrawingFile | null {
  if (!isRecord(raw) || !Array.isArray(raw.layers) || !Array.isArray(raw.shapes)) return null;
  const layers = raw.layers.map(parseLayer).filter((l): l is Layer => l !== null);
  if (layers.length === 0) return null;
  const layerIds = new Set(layers.map((l) => l.id));
  const shapes = raw.shapes.map((s) => parseShape(s, layerIds)).filter((s): s is Shape => s !== null);
  return {
    version: 1,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : DEFAULT_DRAWING_NAME,
    layers,
    shapes,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
  };
}

export function loadSavedDrawing(): DrawingFile | null {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    return text ? parseDrawing(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/** 저장에 성공하면 true — 저장 공간 부족·사생활 보호 모드 등으로 실패할 수 있다 */
export function saveDrawing(drawing: Omit<DrawingFile, 'version' | 'savedAt'>): boolean {
  try {
    const file: DrawingFile = { version: 1, ...drawing, savedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

/** 파일 이름에 쓸 수 없는 문자를 걸러낸 도면 이름 */
export function toFileBaseName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || DEFAULT_DRAWING_NAME;
}

export function downloadDrawingFile(drawing: Omit<DrawingFile, 'version' | 'savedAt'>): void {
  const file: DrawingFile = { version: 1, ...drawing, savedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${toFileBaseName(drawing.name)}${DRAWING_FILE_EXTENSION}`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readDrawingFile(file: File): Promise<DrawingFile | null> {
  try {
    return parseDrawing(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
