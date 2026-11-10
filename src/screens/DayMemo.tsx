import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db, uid, MEMO_TAGS, type DayNote, type Dog, type MemoTag } from '../db'
import { useDayNotes } from '../lib/useData'
import { currentUserId } from '../lib/cloud'
import { nowLocalISO, today } from '../lib/format'

/** Tag toggles (appetite, energy, urination, stool, other); several can be on at once. */
function TagPicker({ value, onChange }: { value: MemoTag[]; onChange: (v: MemoTag[]) => void }) {
  const { t } = useTranslation()
  return (
    <div className="memo-tags">
      {MEMO_TAGS.map((k) => (
        <button key={k} className={value.includes(k) ? 'on' : ''} onClick={() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])}>{t('memo.tags.' + k)}</button>
      ))}
    </div>
  )
}

/** Tags then text, as shown in lists. */
export function MemoText({ note }: { note: DayNote }) {
  const { t } = useTranslation()
  return (
    <>
      {note.tags.map((k) => <span key={k} className={'tag memo-' + k} style={{ marginRight: 4 }}>{t('memo.tags.' + k)}</span>)}
      <span className="memo-body">{note.text}</span>
    </>
  )
}

/** Home card: today's notes for this dog and a box to add one. */
export function MemoCard({ dog }: { dog: Dog }) {
  const { t } = useTranslation()
  const notes = useDayNotes(dog.id)
  const now = today()
  const todays = notes.filter((n) => n.date === now)
  const [tags, setTags] = useState<MemoTag[]>([])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  async function add() {
    if (!text.trim() && !tags.length) return
    const at = nowLocalISO()
    await db.dayNotes.add({ id: uid(), dogId: dog.id, date: at.slice(0, 10), time: at.slice(11, 16), tags, text: text.trim(), by: currentUserId() ?? undefined, updatedAt: new Date().toISOString() })
    setTags([])
    setText('')
  }
  const edit = notes.find((n) => n.id === editing)
  return (
    <div className="card">
      <h4>{t('memo.title')}</h4>
      {todays.map((n) => (
        <div className="row memo-row" key={n.id} onClick={() => setEditing(n.id)} style={{ cursor: 'pointer' }}>
          <span className="d">{n.time}</span>
          <span className="grow"><MemoText note={n} /></span>
          <span className="note">{t('dose.fix')}</span>
        </div>
      ))}
      <TagPicker value={tags} onChange={setTags} />
      <textarea className="memo-input" rows={2} value={text} placeholder={t('memo.placeholder')} onChange={(e) => setText(e.target.value)} />
      <button className="btn sm" style={{ marginTop: 6 }} disabled={!text.trim() && !tags.length} onClick={add}>{t('memo.add')}</button>
      {edit && <MemoEdit note={edit} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Sheet to change a note's day, tags and text, or delete it. */
export function MemoEdit({ note, onClose }: { note: DayNote; onClose: () => void }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(note.date)
  const [tags, setTags] = useState<MemoTag[]>(note.tags)
  const [text, setText] = useState(note.text)
  const max = today()
  const empty = !text.trim() && !tags.length
  async function save() {
    if (!date || date > max || empty) return
    await db.dayNotes.update(note.id, { date, tags, text: text.trim(), updatedAt: new Date().toISOString() })
    onClose()
  }
  async function remove() {
    if (!confirm(t('memo.removeConfirm'))) return
    await db.dayNotes.delete(note.id)
    onClose()
  }
  return (
    <div className="alert-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="alert-box dose-edit" onClick={(e) => e.stopPropagation()}>
        <h3>{t('memo.editTitle')}</h3>
        <div className="field">
          <span className="k">{t('memo.date')}</span>
          <input type="date" value={date} max={max} onChange={(e) => setDate(e.target.value)} />
        </div>
        <TagPicker value={tags} onChange={setTags} />
        <textarea className="memo-input" rows={3} value={text} placeholder={t('memo.placeholder')} onChange={(e) => setText(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" style={{ flex: 1 }} disabled={!date || date > max || empty} onClick={save}>{t('btn.save')}</button>
          <button className="btn sec" onClick={onClose}>{t('btn.cancel')}</button>
        </div>
        <button className="dose-edit-undo" onClick={remove}>{t('memo.remove')}</button>
      </div>
    </div>
  )
}
