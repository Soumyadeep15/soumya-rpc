export interface Tracker {
  track(work: Promise<unknown>): void
  idle(): Promise<void>
}

export function createTracker(): Tracker {
  const active = new Set<Promise<unknown>>()
  const remove = (work: Promise<unknown>) => () => active.delete(work)

  return {
    track(work) {
      active.add(work)
      work.then(remove(work), remove(work))
    },
    async idle() {
      while (active.size > 0) await Promise.allSettled(active)
    },
  }
}
