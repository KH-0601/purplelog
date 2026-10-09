import type { Dog } from '../db'

/** Distinct, high-contrast colours so each dog is recognisable at a glance (order = registration order). */
export const DOG_PALETTE = ['#6B4FBB', '#E07A2F', '#2A9D8F', '#D64570', '#3B7DD8', '#8A9A2B']

export function dogColorMap(dogs: Dog[]): Record<string, string> {
  const out: Record<string, string> = {}
  dogs.forEach((d, i) => { out[d.id] = d.color || DOG_PALETTE[i % DOG_PALETTE.length] })
  return out
}
