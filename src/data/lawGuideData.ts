export type LawCategory = '헤드' | '배관' | '수원' | '가압송수장치';

export interface LawArticle {
  id: string;
  code: string;
  title: string;
  summary: string;
  category: LawCategory;
}

/**
 * 더미 NFPC(화재안전성능기준) 참고 데이터 — 실제 설계·시공 전에는 반드시 최신 원문을 확인해야 한다.
 * 도면 작성 중 참조하기 쉽도록 스프링클러 헤드 관련 조항을 우선 배치했다.
 */
export const dummyLawArticles: LawArticle[] = [
  {
    id: 'nfpc103-10-1',
    code: 'NFPC 103 제10조',
    title: '헤드와 벽·보 사이 수평거리',
    summary: '스프링클러헤드는 살수가 방해되지 않도록 벽·보로부터 수평거리 기준(용도별 상이, 예 라지드롭형 3.2m 이하)을 두고 배치해야 한다.',
    category: '헤드',
  },
  {
    id: 'nfpc103-10-2',
    code: 'NFPC 103 제10조',
    title: '헤드 상호 간 배치 간격',
    summary: '헤드 간 배치는 방호구역 내 살수반경이 겹치도록 하되, 감지 및 살수에 사각지대가 발생하지 않게 배치 간격을 산정한다.',
    category: '헤드',
  },
  {
    id: 'nfpc103-10-3',
    code: 'NFPC 103 제10조',
    title: '살수분포에 장애가 되는 장애물',
    summary: '헤드 주위에 살수를 방해하는 장애물이 있는 경우 장애물과 헤드 사이 거리 및 반사판 위치 기준을 별도로 적용한다.',
    category: '헤드',
  },
  {
    id: 'nfpc103-6-1',
    code: 'NFPC 103 제6조',
    title: '수원의 저수량 산정',
    summary: '스프링클러설비의 수원은 설치장소별 기준개수에 헤드 1개당 방수량을 곱한 값 이상을 저수하도록 산정한다.',
    category: '수원',
  },
  {
    id: 'nfpc103-8-1',
    code: 'NFPC 103 제8조',
    title: '가압송수장치의 방수압력·방수량',
    summary: '가압송수장치는 규정 방수압력 이상에서 헤드 1개당 기준 방수량 이상이 방수되도록 설계해야 한다.',
    category: '가압송수장치',
  },
  {
    id: 'nfpc103-9-1',
    code: 'NFPC 103 제9조',
    title: '배관의 구경 및 배치',
    summary: '배관은 유수검지장치 2차측 배관 기준 구경과 가지배관의 헤드 개수 제한을 준수하여 설계한다.',
    category: '배관',
  },
  {
    id: 'nfpc103-9-2',
    code: 'NFPC 103 제9조',
    title: '가지배관의 헤드 개수 제한',
    summary: '가지배관 하나에 설치하는 헤드 개수는 배관 구경별 기준표를 따르며, 유지관리를 위한 점검구를 함께 고려한다.',
    category: '배관',
  },
];
