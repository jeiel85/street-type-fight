import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('웹 앱 매니페스트', () => {
  it('앱 id가 이 게임의 경로다(같은 출처의 다른 앱과 겹치지 않게)', () => {
    // "./"는 manifest 위치가 아니라 출처(jeiel85.github.io) 기준으로 풀려 같은 출처의 다른 게임과 같은 앱이 된다(DECISIONS.md D6).
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as { id?: string };
    expect(manifest.id).toBe('/street-type-fight/');
  });
});
