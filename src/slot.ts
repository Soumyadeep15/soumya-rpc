export interface Slot<T> {
  set(value: T): void
  clear(): void
  get(): Promise<T>
}

export function createSlot<T>(): Slot<T> {
  let current: T | undefined
  const waiting: Array<(value: T) => void> = []

  return {
    set(value) {
      current = value
      for (const resolve of waiting.splice(0)) resolve(value)
    },
    clear() {
      current = undefined
    },
    get() {
      if (current !== undefined) return Promise.resolve(current)
      return new Promise((resolve) => waiting.push(resolve))
    },
  }
}
