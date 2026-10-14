import { describe, expect, it } from 'vitest';
import { GAME_URL, rankTitle, shareText, type ScoreCardData } from '../../src/ui/scorecard';

describe('점수 카드', () => {
  it('전투 타속 구간마다 칭호가 정해진다', () => {
    expect(rankTitle(0)).toBe('구경꾼');
    expect(rankTitle(99.9)).toBe('구경꾼');
    expect(rankTitle(100)).toBe('동네 새내기');
    expect(rankTitle(299)).toBe('골목 주먹');
    expect(rankTitle(300)).toBe('장터 싸움꾼');
    expect(rankTitle(450)).toBe('마을 대장');
    expect(rankTitle(599)).toBe('고을 영웅');
    expect(rankTitle(900)).toBe('전설의 타자왕');
  });

  it('공유 문구에 타속·칭호·결과·주소가 들어간다', () => {
    const d: ScoreCardData = {
      won: true,
      winner: 'blue',
      score: { blue: 15, red: 9 },
      kpm: 342.4,
      accuracy: 0.968,
      stats: { correct: 0, wrong: 0, kos: 5, deaths: 2, blocks: 4, parries: 3, hitsTaken: 0, damageDealt: 0, maxCombo: 40 },
    };
    const text = shareText(d);
    expect(text).toContain('342타');
    expect(text).toContain('「장터 싸움꾼」');
    expect(text).toContain('96.8%');
    expect(text).toContain('5KO로 승리');
    expect(text).toContain(GAME_URL);
  });
});
