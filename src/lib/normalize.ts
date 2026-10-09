import type { ReferenceRange } from '../db'

/** 0 = lower limit of the reference range, 1 = upper limit. */
export function normalize(value: number, r: ReferenceRange | undefined): number | undefined {
  if (!r || r.high === r.low) return undefined
  return (value - r.low) / (r.high - r.low)
}

export function findRange(refs: ReferenceRange[], analyte: string, labName?: string): ReferenceRange | undefined {
  return refs.find((r) => r.analyte === analyte && r.labName === (labName ?? '')) ?? refs.find((r) => r.analyte === analyte)
}
