// 타자 단어 사전. 공격 단어·방어 단어는 한 사전에서 '키 수'로 걸러 뽑는다.
// 키 수(두벌식 타수)를 기준으로 하는 이유: 시전 지연(초) 안에 칠 수 있는 양은 글자 수가 아니라 타수로 정해진다.

import { makeWord, type Word } from './hangul';

const NOUNS = `
가방 감자 고래 거미 구름 국수 기차 김밥 가위 거울 고양이 강아지 개구리 굴뚝 그네 금붕어 곰 공 귤 길 감 강 겨울 고추 가지 기린 고구마 거북이
꿀 꽃 꿈 끈 깃발 까치 꼬리 꽃게 꿀벌 깍두기 껌 꼭지 꽈배기 까마귀
나무 나비 노래 눈사람 냄비 낙타 너구리 노을 눈 낫 논 놀이터 냉면 나팔 누룽지 나침반
다리 달걀 돌 달 도토리 두부 대나무 당근 돼지 도시락 담요 동굴 들판 둥지 독수리 다람쥐
떡 딸기 땅콩 똥 뚜껑 뜰 떡볶이 땀 띠 뗏목 떡국 뚝배기
라면 라디오 로봇 리본 레몬 램프 로켓 루비 라벤더
마늘 망치 메아리 모자 무지개 문어 물감 미역 만두 매미 말 문 물 밀 멸치 목도리 모래 미끄럼틀 망원경
바다 바람 배추 버섯 벌레 별 보리 부채 비누 빗자루 바위 방 벽 밤 붓 반지 번개 보물 북극곰
빵 뼈 뿔 뿌리 빨대 뻐꾸기 빨래 뻥튀기
사과 사자 수박 시계 사탕 소금 송편 신발 상어 솥 솔 숲 섬 실 새우 세수 소나기 솜사탕 수달
쌀 씨앗 썰매 쑥 쌍둥이 씨름 싹 쌈밥
우산 오리 연필 인형 여우 양말 오이 우유 얼음 약 옷 알 연 엿 우물 이불 안경 앵무새 오징어 은행 열쇠
자두 주먹 지도 장갑 조개 종이 줄넘기 잠자리 집 죽 잔 짐 지렁이 주전자
짜장면 찌개 쪽지 찐빵 짝꿍 쪽
참새 치즈 칫솔 축구 창문 책 춤 침 체리 촛불 청소기 친구
코끼리 캥거루 콩 칼 키 코 커피 쿠키 컵 카메라 코코아 콩나물
토끼 타조 태양 토마토 트럭 탑 탈 턱 톱 통 튤립 태권도 털실
파도 포도 피아노 팽이 풍선 펭귄 팥 펜 풀 피자 파리 편지 파전 팝콘
하마 호박 햄버거 하늘 해 혀 활 흙 향 호떡 휴지 해바라기 호랑이 허수아비
`;

// 필살기용 속담. 띄어쓰기도 Space 키로 쳐야 한다. 너무 길면 난전 중에 칠 수 없으므로 12음절 이하만 둔다.
const PROVERBS_RAW = [
  '누워서 떡 먹기', '우물 안 개구리', '티끌 모아 태산', '칼로 물 베기', '개천에서 용 난다',
  '작은 고추가 더 맵다', '꿩 먹고 알 먹고', '소 잃고 외양간 고친다', '공든 탑이 무너지랴',
  '빈 수레가 요란하다', '피는 물보다 진하다', '남의 떡이 커 보인다', '백지장도 맞들면 낫다',
  '천 리 길도 한 걸음부터', '세 살 버릇 여든까지 간다', '믿는 도끼에 발등 찍힌다',
  '지렁이도 밟으면 꿈틀한다', '고래 싸움에 새우 등 터진다', '원숭이도 나무에서 떨어진다',
  '호랑이도 제 말 하면 온다', '쇠뿔도 단김에 빼라', '뛰는 놈 위에 나는 놈 있다',
  '발 없는 말이 천 리 간다', '등잔 밑이 어둡다', '하룻강아지 범 무서운 줄 모른다',
];

export const MAX_PROVERB_SYLLABLES = 12;

export const NOUN_WORDS: readonly Word[] = [...new Set(NOUNS.split(/\s+/).filter(Boolean))].map(makeWord);
export const PROVERB_WORDS: readonly Word[] = PROVERBS_RAW
  .filter((p) => p.replace(/ /g, '').length <= MAX_PROVERB_SYLLABLES)
  .map(makeWord);

export interface Rng {
  next(): number;
}

function pick<T>(rng: Rng, items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng.next() * items.length)] ?? null;
}

/**
 * 키 수 범위 안에서, 이미 화면에 떠 있는 후보와 첫 키가 겹치지 않는 단어를 뽑는다.
 * 범위 안에 없으면 범위를 넓혀 다시 찾고, 그래도 없으면 null(첫 키 19종이 모두 쓰인 극단적 상황).
 */
export function pickWord(
  rng: Rng,
  pool: readonly Word[],
  minKeys: number,
  maxKeys: number,
  excludedFirst: ReadonlySet<string>,
  avoidText?: string,
): Word | null {
  const free = pool.filter((w) => !excludedFirst.has(w.keys[0]!) && w.text !== avoidText);
  const inRange = free.filter((w) => w.keys.length >= minKeys && w.keys.length <= maxKeys);
  if (inRange.length > 0) return pick(rng, inRange);
  const sorted = [...free].sort(
    (a, b) => rangeDistance(a.keys.length, minKeys, maxKeys) - rangeDistance(b.keys.length, minKeys, maxKeys),
  );
  const best = sorted[0];
  if (!best) return null;
  const bestDist = rangeDistance(best.keys.length, minKeys, maxKeys);
  return pick(rng, sorted.filter((w) => rangeDistance(w.keys.length, minKeys, maxKeys) === bestDist));
}

function rangeDistance(n: number, min: number, max: number): number {
  return n < min ? min - n : n > max ? n - max : 0;
}
