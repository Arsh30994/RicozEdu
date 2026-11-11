import { dateRangesOverlap, timesOverlap } from './academic-rules';

describe('academic timetable conflict rules', () => {
  it('detects overlapping sessions', () => {
    expect(timesOverlap('09:00', '10:30', '10:00', '11:00')).toBe(true);
  });

  it('allows back-to-back sessions', () => {
    expect(timesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false);
  });

  it('detects overlapping effective date ranges', () => {
    expect(dateRangesOverlap(new Date('2026-01-01'), new Date('2026-06-30'), new Date('2026-06-01'), new Date('2026-12-31'))).toBe(true);
  });

  it('allows non-overlapping effective date ranges', () => {
    expect(dateRangesOverlap(new Date('2026-01-01'), new Date('2026-05-31'), new Date('2026-06-01'), new Date('2026-12-31'))).toBe(false);
  });
});
