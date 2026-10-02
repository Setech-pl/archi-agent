import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [trialRoot, fixture] = process.argv.slice(2);
if (!trialRoot || !fixture) throw new Error('usage: diagnose-b.mjs <extracted-trial-root> <pdf>');
const trial = path.join(trialRoot, 'extension/ux2-trial');
const requireTrial = createRequire(pathToFileURL(path.join(trial, 'convert.mjs')));
const moduleFile = path.join(trial, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const workerFile = path.join(trial, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
const manifest = JSON.parse(await readFile(path.join(trial, 'resource-manifest.json')));
const record = async (file) => {
  const bytes = await readFile(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const expected = manifest.files.find((entry) => entry.path === path.relative(trial, file).split(path.sep).join('/'))?.sha256;
  return { file: path.relative(trial, file), bytes: bytes.length, sha256, manifestMatch: sha256 === expected };
};

const { getDocumentProxy } = await import(pathToFileURL(path.join(trial, 'node_modules/unpdf/dist/index.mjs')));
const bytes = await readFile(fixture);
const textDoc = await getDocumentProxy(new Uint8Array(bytes), { maxImageSize: 1, verbosity: 0 });
await textDoc.getPage(1).then(async (page) => { await page.getTextContent(); page.cleanup(); });
await textDoc.destroy();
delete globalThis.pdfjsWorker;

const canvas = requireTrial('@napi-rs/canvas');
for (const name of ['DOMMatrix', 'ImageData', 'Path2D']) globalThis[name] ??= canvas[name];
const pdfjs = await import(pathToFileURL(moduleFile));
pdfjs.GlobalWorkerOptions.workerSrc = workerFile;
class CanvasFactory {
  create(width, height) { const c = canvas.createCanvas(width, height); return { canvas: c, context: c.getContext('2d') }; }
  reset(pair, width, height) { pair.canvas.width = width; pair.canvas.height = height; }
  destroy(pair) { pair.canvas.width = pair.canvas.height = 0; pair.canvas = pair.context = null; }
}
class LocalCMapReaderFactory {
  constructor({ baseUrl, isCompressed }) { this.baseUrl = baseUrl; this.isCompressed = isCompressed; }
  async fetch({ name }) { return { cMapData: new Uint8Array(await readFile(path.join(this.baseUrl, `${name}.bcmap`))), isCompressed: this.isCompressed }; }
}
class LocalStandardFontDataFactory {
  constructor({ baseUrl }) { this.baseUrl = baseUrl; }
  async fetch({ filename }) { return new Uint8Array(await readFile(path.join(this.baseUrl, filename))); }
}
console.log(JSON.stringify({ pdfjsVersion: pdfjs.version, module: await record(moduleFile), worker: await record(workerFile) }));
for (const [stopAtErrors, operation] of [[false, 'operators'], [true, 'operators'], [true, 'render']]) {
  const options = { data: new Uint8Array(bytes), CanvasFactory,
    CMapReaderFactory: LocalCMapReaderFactory, StandardFontDataFactory: LocalStandardFontDataFactory,
    cMapUrl: path.join(trial, 'node_modules/pdfjs-dist/cmaps/'), cMapPacked: true,
    standardFontDataUrl: path.join(trial, 'node_modules/pdfjs-dist/standard_fonts/'),
    stopAtErrors, maxImageSize: 16_000_000,
    isEvalSupported: false, disableAutoFetch: true, disableStream: true,
    useSystemFonts: false, disableFontFace: true, verbosity: 0 };
  const task = pdfjs.getDocument(options);
  let doc;
  try {
    doc = await task.promise;
    const page = await doc.getPage(1);
    if (stopAtErrors && operation === 'operators') {
      const handler = page._transport.messageHandler;
      const originalSend = handler.sendWithStream.bind(handler);
      handler.sendWithStream = (...args) => {
        const stream = originalSend(...args);
        if (args[0] !== 'GetOperatorList') return stream;
        const originalReader = stream.getReader.bind(stream);
        stream.getReader = (...readerArgs) => {
          const reader = originalReader(...readerArgs);
          const originalRead = reader.read.bind(reader);
          reader.read = async () => {
            try { return await originalRead(); }
            catch (error) {
              console.log(JSON.stringify({ at: 'GetOperatorList reader.read', status: 'rejected', name: error.name, message: error.message }));
              throw error;
            }
          };
          return reader;
        };
        return stream;
      };
    }
    try {
      if (operation === 'operators') {
        const ops = await page.getOperatorList();
        console.log(JSON.stringify({ operation, stopAtErrors, maxImageSize: options.maxImageSize, status: 'resolved', operatorCount: ops.fnArray.length }));
      } else {
        const pair = new CanvasFactory().create(10, 10);
        try {
          await page.render({ canvasContext: pair.context, viewport: page.getViewport({ scale: 0.01 }) }).promise;
          console.log(JSON.stringify({ operation, stopAtErrors, maxImageSize: options.maxImageSize, status: 'resolved' }));
        } finally { new CanvasFactory().destroy(pair); }
      }
    } finally { page.cleanup(); }
  } catch (error) {
    console.log(JSON.stringify({ operation, stopAtErrors, maxImageSize: options.maxImageSize, status: 'rejected', name: error.name, message: error.message }));
  } finally { await doc?.destroy(); await task.destroy(); }
}
