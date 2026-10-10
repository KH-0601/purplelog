/** Shrink a picked image to a small square-ish JPEG data URL (fits in the shared record, no storage needed). */
export async function shrinkImage(file: Blob, max = 480, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file).catch(() => null)
  const img = bmp ?? (await loadImg(file))
  const w = 'width' in img ? img.width : 0
  const h = 'height' in img ? img.height : 0
  const scale = Math.min(1, max / Math.max(w, h))
  const cw = Math.round(w * scale), ch = Math.round(h * scale)
  const c = document.createElement('canvas')
  c.width = cw; c.height = ch
  c.getContext('2d')!.drawImage(img as CanvasImageSource, 0, 0, cw, ch)
  return c.toDataURL('image/jpeg', quality)
}
function loadImg(file: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => { URL.revokeObjectURL(url); res(i) }
    i.onerror = rej
    i.src = url
  })
}
