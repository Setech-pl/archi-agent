import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
const out = path.resolve(process.argv[2] ?? 'build/fixtures');
mkdirSync(out, { recursive: true });
export const expected = {
  pl: 'Zażółć gęślą jaźń. Łódź i źródło informacji. Ćma śpi wśród żółtych róż.',
  en: 'The quick brown fox jumps over the lazy dog. Architecture review is complete.'
};

function scan(dpi, quality, language) {
  const width = Math.round(8.5 * dpi), height = 11 * dpi;
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111';
  ctx.font = `${Math.round(dpi / 5)}px Arial`;
  ctx.translate(width / 2, height / 2);
  if (quality === 'skew') ctx.rotate(0.026);
  const words = expected[language].split(' ');
  const lines = [];
  while (words.length) lines.push(words.splice(0, 8).join(' '));
  lines.forEach((line, index) => ctx.fillText(line, -width * .38, -height * .15 + index * dpi * .32));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (quality === 'noise') {
    const image = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < width * height; i += 47) {
      const p = i * 4;
      image.data[p] = image.data[p + 1] = image.data[p + 2] = 145;
    }
    ctx.putImageData(image, 0, 0);
  }
  return { bytes: canvas.toBuffer('image/jpeg', quality === 'compressed' ? 35 : 90), width, height };
}

function pdf(pages) {
  const polishCodes = { 'ż': 128, 'ó': 129, 'ł': 130, 'ć': 131, 'ę': 132,
    'ś': 133, 'ą': 134, 'ź': 135, 'ń': 136 };
  const encodePdfText = (value) => [...value].map((char) => {
    if (polishCodes[char] !== undefined) return `\\${polishCodes[char].toString(8).padStart(3, '0')}`;
    return char.replace(/[\\()]/g, '\\$&');
  }).join('');
  const objects = [null, null];
  const refs = [];
  const sharedImageRefs = new Map();
  const add = (body) => { objects.push(body); return objects.length; };
  for (const spec of pages) {
    const images = spec.images ?? [];
    const imageRefs = images.map((image) => {
      if (image.sharedKey && sharedImageRefs.has(image.sharedKey)) return sharedImageRefs.get(image.sharedKey);
      let maskRef;
      if (image.mask || image.transparent) {
        const alpha = Buffer.alloc(image.width * image.height, 255);
        alpha.fill(0, 0, image.transparent ? alpha.length : Math.round(image.width * image.height / 20));
        const compressed = deflateSync(alpha);
        maskRef = add([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`), compressed, Buffer.from('\nendstream')]);
      }
      const bytes = image.corrupt ? Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11]) : image.bytes;
      const ref = add([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ${maskRef ? `/SMask ${maskRef} 0 R ` : ''}/Length ${bytes.length} >>\nstream\n`), bytes, Buffer.from('\nendstream')]);
      if (image.sharedKey) sharedImageRefs.set(image.sharedKey, ref);
      return ref;
    });
    const commands = images.map((_, i) => `q ${images.length > 1 ? 306 : 612} 0 0 792 ${i * 306} 0 cm /Im${i + 1} Do Q`).join('\n') +
      (spec.repeatFirstImage ? '\nq 612 0 0 792 0 0 cm /Im1 Do Q'.repeat(8) : '');
    const textLines = Array.isArray(spec.text) ? spec.text : spec.text ? [spec.text] : [];
    const text = textLines.length ? `\nBT /F1 20 Tf 40 740 Td 24 TL ${textLines.map((line, i) => `${i ? 'T* ' : ''}(${encodePdfText(line)}) Tj`).join(' ')} ET` : '';
    const stream = Buffer.from(commands + text);
    const content = add([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]);
    const xobjects = imageRefs.map((ref, i) => `/Im${i + 1} ${ref} 0 R`).join(' ');
    refs.push(add(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${spec.width ?? 612} ${spec.height ?? 792}] /Resources << /XObject << ${xobjects} >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 /zdotaccent /oacute /lslash /cacute /eogonek /sacute /aogonek /zacute /nacute] >> >> >> >> /Contents ${content} 0 R >>`)));
  }
  objects[0] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${refs.map((n) => `${n} 0 R`).join(' ')}] /Count ${refs.length} >>`);
  const parts = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  let offset = parts[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const body = Buffer.isBuffer(objects[i]) ? [objects[i]] : objects[i];
    const chunks = [Buffer.from(`${i + 1} 0 obj\n`), ...body, Buffer.from('\nendobj\n')];
    parts.push(...chunks); offset += chunks.reduce((n, c) => n + c.length, 0);
  }
  const xref = Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`);
  return Buffer.concat([...parts, xref]);
}

for (const dpi of [200, 300]) for (const quality of ['clean', 'compressed', 'noise', 'skew']) for (const language of ['pl', 'en']) {
  const image = scan(dpi, quality, language);
  writeFileSync(path.join(out, `${language}-${quality}-${dpi}.pdf`), pdf([{ images: [image] }]));
}
const good = scan(200, 'clean', 'pl');
writeFileSync(path.join(out, 'mixed.pdf'), pdf([{ text: 'TEXT LAYER FIRST' }, { images: [good] }, {}]));
writeFileSync(path.join(out, 'text-only.pdf'), pdf([{ text: 'TEXT LAYER FIRST' }, { text: 'TEXT LAYER SECOND' }]));
writeFileSync(path.join(out, 'blank-only.pdf'), pdf([{}]));
writeFileSync(path.join(out, 'text-compat.pdf'), pdf([
  { text: ['Zażółć gęślą jaźń', 'Hello *Markdown* [test] (x) #1.'] },
  {},
  { text: ['Pierwsza linia', 'Druga linia: `kod` _podkreslenie_ <tag>'] },
  { text: 'English final page.' }
]));
writeFileSync(path.join(out, 'corrupt.pdf'), pdf([{ images: [{ ...good, corrupt: true }] }]));
writeFileSync(path.join(out, 'good-and-corrupt.pdf'), pdf([{ images: [good, { ...good, corrupt: true }] }]));
writeFileSync(path.join(out, 'repeat-corrupt.pdf'), pdf([{ images: [{ ...good, corrupt: true }], repeatFirstImage: true }]));
writeFileSync(path.join(out, 'shared-corrupt.pdf'), pdf([
  { images: [{ ...good, corrupt: true, sharedKey: 'broken' }] },
  { images: [{ ...good, corrupt: true, sharedKey: 'broken' }] }
]));
writeFileSync(path.join(out, 'good-then-corrupt.pdf'), pdf([{ images: [good] }, { images: [{ ...good, corrupt: true }] }]));
writeFileSync(path.join(out, 'mask.pdf'), pdf([{ images: [{ ...good, mask: true }] }]));
writeFileSync(path.join(out, 'transparent.pdf'), pdf([{ images: [{ ...good, transparent: true }] }]));
writeFileSync(path.join(out, 'oversize-image.pdf'), pdf([{ images: [{ ...good, width: 5000, height: 5000 }] }]));
writeFileSync(path.join(out, 'image-at-16mp.pdf'), pdf([{ images: [{ ...good, width: 4000, height: 4000 }] }]));
writeFileSync(path.join(out, 'image-over-16mp.pdf'), pdf([{ images: [{ ...good, width: 4000, height: 4001 }] }]));
writeFileSync(path.join(out, 'text-then-oversize.pdf'), pdf([{ text: 'TEXT LAYER FIRST' }, { images: [{ ...good, width: 5000, height: 5000 }] }]));
writeFileSync(path.join(out, 'good-then-oversize.pdf'), pdf([{ images: [good] }, { images: [{ ...good, width: 5000, height: 5000 }] }]));
writeFileSync(path.join(out, 'good-and-oversize.pdf'), pdf([{ images: [good, { ...good, width: 5000, height: 5000 }] }]));
const largeCanvas = createCanvas(4000, 4001);
const largeContext = largeCanvas.getContext('2d');
largeContext.fillStyle = '#fff'; largeContext.fillRect(0, 0, 4000, 4001);
largeContext.fillStyle = '#111'; largeContext.fillRect(100, 100, 100, 100);
const realOver = { bytes: largeCanvas.toBuffer('image/jpeg', 70), width: 4000, height: 4001 };
writeFileSync(path.join(out, 'real-image-over-16mp.pdf'), pdf([{ images: [realOver] }]));
writeFileSync(path.join(out, 'oversize-canvas.pdf'), pdf([{ width: 800, height: 1000, images: [good] }]));
writeFileSync(path.join(out, 'twenty.pdf'), pdf(Array.from({ length: 20 }, () => ({ images: [good] }))));
writeFileSync(path.join(out, 'twenty-one.pdf'), pdf(Array.from({ length: 21 }, () => ({ images: [good] }))));
console.log(out);
