import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDog, useEvents, useLabs, useMeds, useMonthly, useRefs } from '../lib/useData'
import LongTermChart, { type Period } from './LongTermChart'

export default function LongTerm() {
  const { t } = useTranslation()
  const dog = useDog()
  const events = useEvents(dog?.id)
  const monthly = useMonthly(dog?.id)
  const meds = useMeds(dog?.id)
  const labs = useLabs(dog?.id)
  const refs = useRefs()
  const [period, setPeriod] = useState<Period>('all')
  if (!dog) return null
  return (
    <>
      <div className="period">
        {(['m1', 'm3', 'm6', 'y1', 'all'] as Period[]).map((p) => (
          <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
            {t('chart.period.' + p)}
          </button>
        ))}
      </div>
      <LongTermChart events={events} monthly={monthly} meds={meds} labs={labs} refs={refs} period={period} />
    </>
  )
}
