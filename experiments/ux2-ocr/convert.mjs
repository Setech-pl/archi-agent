import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const base = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { definePDFJSModule, getDocumentProxy } = await import('unpdf');
const { createWorker } = require('tesseract.js');
let canvasLib, officialPdf, imageOps, backendPromise, pdfModulePromise;
let activeOcr = false;

async function loadPdfModule() {
  pdfModulePromise ??= (async () => {
    const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
    await definePDFJSModule(() => pdf);
    pdf.GlobalWorkerOptions.workerSrc = path.join(base, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
    return pdf;
  })();
  return pdfModulePromise;
}

async function loadRenderBackend() {
  backendPromise ??= (async () => {
    try { canvasLib = require('@napi-rs/canvas'); }
    catch { throw new Error('canvas-binding-unavailable'); }
    for (const name of ['DOMMatrix', 'ImageData', 'Path2D']) globalThis[name] = canvasLib[name];
    officialPdf = await loadPdfModule();
    imageOps = new Set([officialPdf.OPS.paintImageXObject, officialPdf.OPS.paintInlineImageXObject,
      officialPdf.OPS.paintImageXObjectRepeat, officialPdf.OPS.paintImageMaskXObject,
      officialPdf.OPS.paintImageMaskXObjectRepeat, officialPdf.OPS.paintImageMaskXObjectGroup,
      officialPdf.OPS.paintInlineImageXObjectGroup]);
  })();
  await backendPromise;
}

class CanvasFactory {
  create(width, height) {
    const canvas = canvasLib.createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(pair, width, height) { pair.canvas.width = width; pair.canvas.height = height; }
  destroy(pair) { pair.canvas.width = 0; pair.canvas.height = 0; pair.canvas = null; pair.context = null; }
}

class LocalCMapReaderFactory {
  constructor({ baseUrl, isCompressed }) { this.baseUrl = baseUrl; this.isCompressed = isCompressed; }
  async fetch({ name }) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('invalid-cmap-name');
    return { cMapData: new Uint8Array(await readFile(path.join(this.baseUrl, `${name}.bcmap`))), isCompressed: this.isCompressed };
  }
}

class LocalStandardFontDataFactory {
  constructor({ baseUrl }) { this.baseUrl = baseUrl; }
  async fetch({ filename }) {
    if (!/^[A-Za-z0-9_.-]+$/.test(filename)) throw new Error('invalid-font-name');
    return new Uint8Array(await readFile(path.join(this.baseUrl, filename)));
  }
}

const pdfAssets = path.join(base, 'node_modules/pdfjs-dist');
const languageAssets = path.join(base, 'assets/lang');
const coreAssets = path.join(base, 'node_modules/tesseract.js-core');
const workerAsset = path.join(base, 'node_modules/tesseract.js/src/worker-script/node/index.js');

function textOf(content) {
  const lines = [];
  let line = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const text = item.str;
    line += text;
    if (item.hasEOL) { lines.push(line); line = ''; }
    else if (text && !text.endsWith(' ')) line += ' ';
  }
  if (line.trim()) lines.push(line);
  return lines.map((value) => value.trim()).join('\n');
}

export async function convert(file, { dpi = 200, fullPage = false, maxPages = 300, maxOcrPages = 20,
  maxCanvasPixels = 10_000_000, maxImagePixels = 16_000_000,
  onStage = () => {}, pause = async () => {} } = {}) {
  const bytes = await readFile(file);
  if (bytes.length > 50 * 1024 * 1024) throw new Error('input-too-large');
  let textDoc, renderTask, renderDoc, ocr;
  let acquiredOcr = false;
  let ocrPages = 0;
  const result = [];
  try {
    onStage('text-init');
    await loadPdfModule();
    textDoc = await getDocumentProxy(new Uint8Array(bytes), {
      isEvalSupported: false, disableAutoFetch: true, disableStream: true,
      useSystemFonts: false, disableFontFace: true, maxImageSize: 1, verbosity: 0
    });
    if (textDoc.numPages > maxPages) throw new Error('too-many-pages');
    for (let number = 1; number <= textDoc.numPages; number++) {
      const textPage = await textDoc.getPage(number);
      let text;
      try { text = textOf(await textPage.getTextContent()); } finally { textPage.cleanup(); }
      if (!fullPage && text) { result.push({ page: number, source: 'text', text }); continue; }
      onStage('ocr-candidate');

      if (!acquiredOcr) {
        if (activeOcr) throw new Error('ocr-busy');
        activeOcr = true;
        acquiredOcr = true;
      }

      if (!renderDoc) {
        onStage('render-init');
        await loadRenderBackend();
        renderTask = officialPdf.getDocument({ data: new Uint8Array(bytes), CanvasFactory,
          CMapReaderFactory: LocalCMapReaderFactory, StandardFontDataFactory: LocalStandardFontDataFactory,
          isEvalSupported: false, disableAutoFetch: true, disableStream: true,
          useSystemFonts: false, disableFontFace: true, stopAtErrors: true,
          maxImageSize: maxImagePixels, verbosity: 0,
          cMapUrl: path.join(pdfAssets, 'cmaps/'), cMapPacked: true,
          standardFontDataUrl: path.join(pdfAssets, 'standard_fonts/') });
        renderDoc = await renderTask.promise;
      }
      const page = await renderDoc.getPage(number);
      let pair;
      try {
        const viewport = page.getViewport({ scale: dpi / 72 });
        const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
        if (width * height > maxCanvasPixels) throw new Error('canvas-limit');
        onStage('render'); await pause('render');
        let operators;
        try { operators = await page.getOperatorList(); }
        catch (error) {
          if (error instanceof Error && error.message.includes('Image exceeded maximum allowed size'))
            throw new Error('embedded-image-limit');
          throw error;
        }
        const imageCount = operators.fnArray.filter((op) => imageOps.has(op)).length;
        for (let i = 0; i < operators.fnArray.length; i++) {
          if (!imageOps.has(operators.fnArray[i])) continue;
          const [id, imageWidth, imageHeight] = operators.argsArray[i];
          if (Number.isFinite(imageWidth) && Number.isFinite(imageHeight) && imageWidth * imageHeight > maxImagePixels)
            throw new Error('embedded-image-limit');
        }
        pair = new CanvasFactory().create(width, height);
        pair.context.fillStyle = '#ffffff';
        pair.context.fillRect(0, 0, width, height);
        await page.render({ canvasContext: pair.context, viewport }).promise;
        if (imageCount === 0 && !text) { result.push({ page: number, source: 'blank', text: '' }); continue; }
        if (++ocrPages > maxOcrPages) throw new Error('too-many-ocr-pages');
        if (!ocr) {
          onStage('ocr-init'); await pause('ocr-init');
          for (const [language, expectedHash] of Object.entries({
            pol: 'c4476cdbc0e33d898d32345122b7be1cbf85ace15f920f06c7714756e1ef79b2',
            eng: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2'
          })) {
            let model;
            try { model = await readFile(path.join(languageAssets, `${language}.traineddata`)); }
            catch { throw new Error('ocr-model-unavailable'); }
            if (createHash('sha256').update(model).digest('hex') !== expectedHash) throw new Error('ocr-model-corrupt');
          }
          ocr = await createWorker(['pol', 'eng'], 1, {
            workerPath: workerAsset, corePath: coreAssets, langPath: languageAssets,
            gzip: false, cacheMethod: 'none', logger: () => {}, errorHandler: () => {}
          });
        }
        onStage('recognize'); await pause('recognize');
        const output = await ocr.recognize(pair.canvas.toBuffer('image/png'));
        result.push({ page: number, source: 'ocr', text: output.data.text.trim(), imageCount });
      } finally {
        if (pair) new CanvasFactory().destroy(pair);
        page.cleanup();
      }
    }
    return result;
  } finally {
    try {
      await textDoc?.destroy();
      await renderDoc?.destroy();
      await renderTask?.destroy();
      if (ocr) {
        const exit = new Promise((resolve) => ocr.worker.once('exit', resolve));
        await ocr.terminate();
        await exit;
        onStage('tesseract-exit');
      }
    } finally {
      if (acquiredOcr) activeOcr = false;
    }
  }
}
