/**
 * 방호 검토에 쓰는 참고 기준값(mm). 설계 판단을 돕기 위한 간이 점검용이며,
 * 실제 설계·시공 전에는 반드시 최신 NFPC(화재안전성능기준) 원문과 현장 조건을 확인해야 한다.
 */

/** 헤드와 벽 사이에 두어야 하는 최소 공간 */
export const MIN_HEAD_TO_WALL_MM = 100;

/** 헤드끼리 이보다 가까우면 서로의 살수를 방해할 수 있어 경고한다 (실무 참고값) */
export const MIN_HEAD_SPACING_MM = 1800;

/** 이보다 작은 미방호 면적(㎡)은 격자 계산 오차로 보고 경고하지 않는다 */
export const UNCOVERED_AREA_TOLERANCE_M2 = 0.05;
