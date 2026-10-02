import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [modulePath, fixtures] = process.argv.slice(2);
if (!modulePath || !fixtures) throw new Error('usage: api-regressions.mjs <patched-pdf.mjs> <fixtures>');
const require = createRequire(modulePath);
const canvas = require('@napi-rs/canvas');
for (const name of ['DOMMatrix', 'ImageData', 'Path2D']) globalThis[name] = canvas[name];
const pdf = await import(pathToFileURL(modulePath));
pdf.GlobalWorkerOptions.workerSrc = path.join(path.dirname(modulePath), 'pdf.worker.mjs');
class CanvasFactory {
  create(width, height) {
    const surface = canvas.createCanvas(width, height);
    return { canvas: surface, context: surface.getContext('2d') };
  }
  reset(pair, width, height) { pair.canvas.width = width; pair.canvas.height = height; }
  destroy(pair) { pair.canvas.width = 0; pair.canvas.height = 0; }
}

async function check(name, api, expected) {
  const bytes = await readFile(path.join(fixtures, `${name}.pdf`));
  const task = pdf.getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, maxImageSize: 16_000_000,
    isEvalSupported: false, disableAutoFetch: true, disableStream: true, useSystemFonts: false,
    disableFontFace: true, CanvasFactory, verbosity: 0 });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    try {
      let error;
      try {
        if (api === 'getOperatorList') await page.getOperatorList();
        else {
          const viewport = page.getViewport({ scale: 1 });
          const surface = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: surface.getContext('2d'), viewport }).promise;
        }
      } catch (caught) { error = caught; }
      const pass = expected === 'resolve' ? !error : error?.message.includes(expected);
      console.log(JSON.stringify({ name, api, expected, pass, actual: error?.message ?? 'resolved' }));
      if (!pass) process.exitCode = 1;
    } finally { page.cleanup(); }
  } finally { await doc.destroy(); await task.destroy(); }
}
for (const api of ['getOperatorList', 'render']) {
  await check('image-over-16mp', api, 'Image exceeded maximum allowed size');
  await check('good-and-oversize', api, 'Image exceeded maximum allowed size');
  await check('mixed', api, 'resolve');
}
for (const name of ['corrupt', 'good-and-corrupt', 'repeat-corrupt'])
  await check(name, 'render', 'image-decode-failed');

{
  const bytes = await readFile(path.join(fixtures, 'shared-corrupt.pdf'));
  const task = pdf.getDocument({ data: new Uint8Array(bytes), stopAtErrors: true,
    isEvalSupported: false, disableAutoFetch: true, disableStream: true, useSystemFonts: false,
    disableFontFace: true, CanvasFactory, verbosity: 0 });
  const doc = await task.promise;
  try {
    for (let number = 1; number <= 2; number++) {
      const page = await doc.getPage(number);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const surface = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        let error;
        try { await page.render({ canvasContext: surface.getContext('2d'), viewport }).promise; }
        catch (caught) { error = caught; }
        const pass = error?.message.includes('image-decode-failed');
        console.log(JSON.stringify({ name: 'shared-corrupt', page: number, api: 'render', pass,
          actual: error?.message ?? 'resolved' }));
        if (!pass) process.exitCode = 1;
      } finally { page.cleanup(); }
    }
  } finally { await doc.destroy(); await task.destroy(); }
}
