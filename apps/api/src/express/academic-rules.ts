export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

export function dateRangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA.getTime() <= endB.getTime() && startB.getTime() <= endA.getTime();
}
