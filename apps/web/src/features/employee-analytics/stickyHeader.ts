export interface StickyHeaderPosition {
  containerTop: number;
  elementTop: number;
  stickyTop: number;
}

export function getStickyHeaderObserverRootMargin(stickyTop: number): string {
  return `${Math.max(-stickyTop, 0)}px 0px 0px 0px`;
}

export function isStickyHeaderStuck({
  containerTop,
  elementTop,
  stickyTop,
}: StickyHeaderPosition): boolean {
  const threshold = containerTop + stickyTop;
  return elementTop <= threshold + 1;
}
