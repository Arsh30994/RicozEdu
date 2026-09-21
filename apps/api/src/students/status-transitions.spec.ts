import { canTransition } from './status-transitions';

describe('student status transitions', () => {
  it('allows prospective -> active', () => {
    expect(canTransition('prospective', 'active')).toBe(true);
  });

  it('allows active to terminal/paused states', () => {
    expect(canTransition('active', 'inactive')).toBe(true);
    expect(canTransition('active', 'suspended')).toBe(true);
    expect(canTransition('active', 'withdrawn')).toBe(true);
    expect(canTransition('active', 'graduated')).toBe(true);
  });

  it('allows suspended/inactive back to active', () => {
    expect(canTransition('suspended', 'active')).toBe(true);
    expect(canTransition('inactive', 'active')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransition('prospective', 'graduated')).toBe(false);
    expect(canTransition('graduated', 'active')).toBe(false);
    expect(canTransition('withdrawn', 'active')).toBe(false);
    expect(canTransition('active', 'prospective')).toBe(false);
  });
});
