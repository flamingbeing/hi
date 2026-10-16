// Photos: shrink a camera picture to a small JPEG (about 30-60 KB) so it fits inside the item itself,
// on the phone and in Firestore (a document can hold 1 MB), with no separate file storage to set up.

export async function shrink(file, max = 480, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally { URL.revokeObjectURL(url); }
}

// A product picture from a web address (Open Food Facts) as a small data URL, so it shows offline too.
export async function fromUrl(src, max = 480) {
  try {
    const r = await fetch(src, { mode: 'cors' });
    if (!r.ok) return null;
    return await shrink(await r.blob(), max);
  } catch { return null; }
}
