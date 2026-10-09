/**
 * Read a laboratory report (photo or screenshot) with Claude via the `sample` capability,
 * and store the image with the `assets` capability. Both are optional: without them the
 * form still accepts a photo (kept on the device) and manual values.
 */
type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json<T>(input: string, opts?: Record<string, unknown>): Promise<T>
  limits(): Promise<{ images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>
}
type Assets = { upload(blob: Blob, o?: { type?: string }): Promise<{ id: string; url: string }> }

const claude = () => (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude

let sampleP: Promise<SampleFn | null> | null = null
let assetsP: Promise<Assets | null> | null = null
export function getSample() {
  if (!sampleP) sampleP = claude()?.use ? (claude()!.use('sample') as Promise<SampleFn | null>) : Promise.resolve(null)
  return sampleP
}
export function getAssets() {
  if (!assetsP) assetsP = claude()?.use ? (claude()!.use('assets') as Promise<Assets | null>) : Promise.resolve(null)
  return assetsP
}
/** True when this view can send images to Claude. */
export async function canReadImages() {
  const s = await getSample()
  if (!s) return false
  try {
    const l = await s.limits()
    return !!l.images
  } catch {
    return false
  }
}

export interface ExtractedResult {
  item: string
  analyte: 'PB' | 'KBr' | 'ZNS' | 'LEV' | 'T4' | 'FT4' | 'TSH' | 'ALT' | 'ALP' | 'OTHER'
  value: number | null
  value_text: string | null
  unit: string | null
  ref_low: number | null
  ref_high: number | null
}
export interface Extracted {
  date: string | null
  lab_name: string | null
  patient_name: string | null
  results: ExtractedResult[]
  notes?: string | null
}

const PROMPT = `添付画像は動物病院向けの臨床検査結果（検査会社の報告書の写真またはスクリーンショット）です。
読み取って、次の形のJSONだけを返してください（説明文は不要）。

{"date":"YYYY-MM-DD または null","lab_name":"検査会社名 または null","patient_name":"患畜名 または null",
 "results":[{"item":"報告書に書かれた項目名そのまま","analyte":"PB|KBr|ZNS|LEV|T4|FT4|TSH|ALT|ALP|OTHER","value":数値 または null,"value_text":"数値にできない表記（例 <0.3）または null","unit":"単位そのまま または null","ref_low":基準範囲の下限数値 または null,"ref_high":基準範囲の上限数値 または null}],
 "notes":"読み取りに自信がない箇所があれば一言、なければ null"}

analyte の対応: フェノバルビタール/フェノバール/Phenobarbital→PB、臭化物/ブロマイド/Bromide/KBr→KBr、ゾニサミド/Zonisamide→ZNS、レベチラセタム/イーケプラ/Levetiracetam→LEV、T4/総T4/サイロキシン/Thyroxine→T4、FT4/遊離T4/Free T4→FT4、TSH/cTSH→TSH、ALT/GPT→ALT、ALP→ALP。それ以外は OTHER。
日付は採血日または受付日を優先し、不明なら報告日。数値は報告書の表記どおり（単位変換はしない）。読めない値は null にして推測しないでください。`

export async function extractFromImage(blob: Blob, signal?: AbortSignal): Promise<Extracted> {
  const s = await getSample()
  if (!s) throw { code: 'not_granted', message: 'sample unavailable' }
  const data = await s.json<Extracted>(PROMPT, { images: [blob], modelTier: 'default', signal, cache: false })
  if (!data || !Array.isArray(data.results)) throw { code: 'invalid_json', message: 'unexpected shape' }
  return data
}

/** Normalise units the app stores: KBr in mg/mL, T4 in µg/dL, FT4 in ng/dL. Returns value + unit (+ a note when converted). */
export function normaliseUnit(analyte: string, value: number, unit: string | null): { value: number; unit: string; note?: string } {
  const u = (unit ?? '').replace(/μ/g, 'µ').replace(/\s/g, '')
  if (analyte === 'PB' || analyte === 'ZNS' || analyte === 'LEV') return { value, unit: 'µg/mL' } // mg/L ≡ µg/mL
  if (analyte === 'KBr') {
    if (/µg\/mL|ug\/mL|mg\/L/i.test(u)) return { value: +(value / 1000).toFixed(3), unit: 'mg/mL', note: `${value} ${u} → mg/mL` }
    return { value, unit: 'mg/mL' }
  }
  if (analyte === 'T4') {
    if (/nmol\/L/i.test(u)) return { value: +(value / 12.87).toFixed(2), unit: 'µg/dL', note: `${value} nmol/L → µg/dL` }
    return { value, unit: 'µg/dL' }
  }
  if (analyte === 'FT4') {
    if (/pmol\/L/i.test(u)) return { value: +(value / 12.87).toFixed(2), unit: 'ng/dL', note: `${value} pmol/L → ng/dL` }
    return { value, unit: 'ng/dL' }
  }
  if (analyte === 'TSH') return { value, unit: 'ng/mL' }
  if (analyte === 'ALT' || analyte === 'ALP') return { value, unit: 'U/L' }
  return { value, unit: unit ?? '' }
}

/** Store the image with the artifact when possible; null when this view cannot (kept on the device only). */
export async function uploadImage(blob: Blob): Promise<string | null> {
  const a = await getAssets()
  if (!a) return null
  try {
    const r = await a.upload(blob, blob.type ? undefined : { type: 'image/jpeg' })
    return r.id
  } catch {
    return null
  }
}

/** Downscale a photo before storing (max 1600 px, JPEG). */
export async function shrinkImage(file: Blob, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 1_500_000) return file
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85))
  } catch {
    return file
  }
}
