/**
 * Therapeutic drug monitoring rules, after the IVETF consensus on medical treatment
 * of canine epilepsy (Bhatti et al. 2015, BMC Vet Res 11:176).
 * The trough window (80% of the dosing interval) is an app convention, not part of the consensus.
 */
export type SamplingRule = 'same_time' | 'not_critical' | 'none'
export interface MonitoringRule {
  generic: string
  sampling: SamplingRule
  firstCheckDays?: number
  secondCheckDays?: number
  intervalMonths?: number
  targetLow?: number
  targetHigh?: number
  unit?: string
  note: { ja: string; en: string }
}

export const MONITORING_RULES: MonitoringRule[] = [
  {
    generic: 'phenobarbital',
    sampling: 'same_time',
    firstCheckDays: 14,
    secondCheckDays: 42,
    intervalMonths: 6,
    targetLow: 15,
    targetHigh: 40,
    unit: 'mg/L',
    note: {
      ja: '定常状態ならどの時点でも可。5 mg/kg 1日2回以上では毎回同じタイミング（トラフ）で採血',
      en: 'Any time at steady state; at ≥5 mg/kg BID sample at the same time (trough) each visit',
    },
  },
  {
    generic: 'potassium_bromide',
    sampling: 'not_critical',
    firstCheckDays: 90,
    intervalMonths: 6,
    targetLow: 1000,
    targetHigh: 3000,
    unit: 'mg/L',
    note: { ja: '採血のタイミングは重要でない。開始約3か月後に測定', en: 'Timing not critical; first check about 3 months after start' },
  },
  {
    generic: 'zonisamide',
    sampling: 'same_time',
    firstCheckDays: 7,
    intervalMonths: 6,
    targetLow: 10,
    targetHigh: 40,
    unit: 'mg/L',
    note: { ja: '開始・変更から最低1週間後。溶血に注意', en: 'At least 1 week after start or change; avoid haemolysis' },
  },
  {
    generic: 'levetiracetam',
    sampling: 'none',
    note: { ja: '定期測定は推奨されない（PB併用時は有用な場合あり）', en: 'Routine monitoring not recommended (may help with phenobarbital)' },
  },
  {
    generic: 'imepitoin',
    sampling: 'none',
    note: { ja: '測定不要', en: 'Monitoring not needed' },
  },
]

export const ruleFor = (generic: string) => MONITORING_RULES.find((r) => r.generic === generic)

export type TimingClass = 'trough' | 'post_dose' | 'not_applicable' | 'unknown'

export function classifyTiming(generic: string, hoursSinceDose: number | undefined, timesPerDay: number | undefined): TimingClass {
  const rule = ruleFor(generic)
  if (rule?.sampling === 'not_critical' || rule?.sampling === 'none') return 'not_applicable'
  if (hoursSinceDose == null || !timesPerDay) return 'unknown'
  const interval = 24 / timesPerDay
  return hoursSinceDose >= interval * 0.8 ? 'trough' : 'post_dose'
}

/** Next suggested measurement date from start/change date. Guidance only. */
export function nextCheck(generic: string, anchorDate: string, previousChecks: string[]): { date: string; reason: 'first' | 'second' | 'interval' } | null {
  const rule = ruleFor(generic)
  if (!rule || rule.sampling === 'none' || !rule.firstCheckDays) return null
  const anchor = new Date(anchorDate)
  const after = previousChecks.filter((d) => d >= anchorDate).sort()
  const add = (d: Date, days: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + days)
    return x.toISOString().slice(0, 10)
  }
  if (after.length === 0) return { date: add(anchor, rule.firstCheckDays), reason: 'first' }
  if (after.length === 1 && rule.secondCheckDays) return { date: add(anchor, rule.secondCheckDays), reason: 'second' }
  const last = new Date(after[after.length - 1])
  return { date: add(last, (rule.intervalMonths ?? 6) * 30), reason: 'interval' }
}
