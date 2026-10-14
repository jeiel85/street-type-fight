// 지형 색·높이에 쓰는 결정적 값 노이즈.

function hash(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const tx = smooth(x - xi);
  const tz = smooth(z - zi);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

export function fbm(x: number, z: number): number {
  return valueNoise(x, z) * 0.6 + valueNoise(x * 2.1 + 17, z * 2.1 - 9) * 0.3 + valueNoise(x * 4.3 - 5, z * 4.3 + 3) * 0.1;
}
