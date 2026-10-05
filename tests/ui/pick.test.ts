import { describe, expect, it } from 'vitest';
import { matchAt } from '../../src/ui/Pick';

describe('matchAt (초성 search)', () => {
  it('matches 초성, mixed, substring, spaces', () => {
    expect(matchAt('리자몽', 'ㄹㅈㅁ')).toBe(0);
    expect(matchAt('메가 리자몽 Y', 'ㄹㅈ')).toBe(2);
    expect(matchAt('메가 리자몽 Y', '리ㅈ몽y')).toBe(2);
    expect(matchAt('한카리아스', '리아')).toBe(2);
    expect(matchAt('한카리아스', 'ㅎㄱ')).toBe(-1);
    expect(matchAt('까칠한피부', 'ㄲㅊ')).toBe(0);
    expect(matchAt('까칠한피부', 'ㄱㅊ')).toBe(-1);
  });
});
