// 밸런스 수치의 단일 출처. docs/GDD.md §13 표와 같은 값이어야 한다.
// 거리 단위는 월드 유닛(캐릭터 키 ≈ 1.7), 시간은 초.

export const CONFIG = {
  tickHz: 60,

  fighter: {
    maxHp: 120,
    radius: 0.45,
    moveSpeed: 5.2,
    /** 공격 단어를 치는 중 이동 입력이 없으면 대상에게 밀고 들어가는 속도. */
    advanceSpeed: 3.4,
    /** 넉백 속도 감쇠(초당 비율). */
    knockFriction: 7,
  },

  combat: {
    /** 대상 지정·잽이 닿는 거리. */
    engageRange: 8,
    /** 이 안이면 근접 보너스. 자동 전진은 이 거리의 80%까지. */
    meleeRange: 2.6,
    closeBonus: 1.5,
    jabDamage: 1.0,
    jabKnock: 0.6,
    /** 콤보 배율 = 1 + min(콤보, comboCap) / comboCap × comboMaxBonus */
    comboCap: 40,
    comboMaxBonus: 0.5,
    finisherBase: 4,
    finisherPerKey: 0.6,
    finisherKnock: 6,
    /** 공격 단어의 키 수 범위. */
    attackKeys: [5, 8] as const,
    /** 남은 시간 비율이 이 이상일 때 방어를 끝내면 반격(패리). */
    parryRatio: 0.4,
    parryReflect: 0.6,
    /** 첫 오타 후 이 시간 안의 연속 오타는 추가 벌칙 없이 무시(타이핑 관성 때문). */
    fumbleWindow: 0.4,
    guardSkillReduction: 0.5,
    /** 범위기는 착탄 순간 반경 × 이 값 밖이면 회피. */
    aoeDodgeSlack: 1.25,
    respawnDelay: 3,
    dummyRespawnDelay: 1.5,
    safeZoneHealPerSec: 18,
  },

  gauge: { max: 100, perKey: 0.6, finisher: 4, block: 6, parry: 12, fumble: -6 },

  ultimate: {
    range: 10,
    windup: 2.2,
    damage: 45,
    knock: 16,
    splashRadius: 3,
    splashDamage: 15,
    defenseKeys: [6, 8] as const,
  },

  match: { killsToWin: 15 },
} as const;
