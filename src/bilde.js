import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';

// Skaler ned bildet (iPad-bilder er store) og gi tilbake JPEG + canvas.
export async function krympBilde(fil, maks = 1600) {
  const bmp = await createImageBitmap(fil);
  const k = Math.min(1, maks / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return { blob, canvas: c };
}

const hints = new Map();
hints.set(DecodeHintType.TRY_HARDER, true);
hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);

// Les strekkode lokalt. Gir null hvis ingen finnes – da tar Claude over.
export async function lesStrekkode(canvas) {
  if ('BarcodeDetector' in window) {
    try {
      const d = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const r = await d.detect(canvas);
      if (r[0]) return r[0].rawValue;
    } catch { /* faller tilbake til ZXing */ }
  }
  try {
    const leser = new BrowserMultiFormatReader(hints);
    const res = await leser.decodeFromImageUrl(canvas.toDataURL('image/jpeg', 0.9));
    return res.getText();
  } catch {
    return null;
  }
}

export function tilBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
