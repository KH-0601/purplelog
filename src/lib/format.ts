export const fmtDate = (iso: string, lang = 'ja') => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return lang === 'ja' ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : d.toLocaleDateString('en-GB')
}
export const fmtMD = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
export const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export const fmtDur = (sec?: number, text?: string) => {
  if (sec == null) return text ?? '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
export const today = () => new Date().toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const nowLocalISO = () => {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
