import type { Shape } from '../types/cad';

export const SPRINKLER_LABEL_PREFIX = 'SP-';
export const COLUMN_LABEL_PREFIX = 'C';

function labelOf(shape: Shape): string | undefined {
  return shape.kind === 'circle' || shape.kind === 'rect' ? shape.label : undefined;
}

/** 같은 접두어의 번호 라벨(SP-1, SP-2 … / C1, C2 …) 중 가장 큰 번호 다음 번호로 새 라벨을 만든다 */
export function nextNumberedLabel(shapes: Shape[], prefix: string): string {
  let max = 0;
  for (const shape of shapes) {
    const label = labelOf(shape);
    if (!label?.startsWith(prefix)) continue;
    const rest = label.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return `${prefix}${max + 1}`;
}

/** 라벨이 자동 번호 형식이면 그 접두어를, 아니면(직접 지은 이름 등) null을 돌려준다 */
export function numberedLabelPrefix(label: string | undefined): string | null {
  if (!label) return null;
  if (/^SP-\d+$/.test(label)) return SPRINKLER_LABEL_PREFIX;
  if (/^C\d+$/.test(label)) return COLUMN_LABEL_PREFIX;
  return null;
}
