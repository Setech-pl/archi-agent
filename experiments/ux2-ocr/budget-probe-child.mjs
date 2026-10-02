process.send?.({ stage: 'ocr-init' });
setTimeout(() => process.send?.({ stage: 'page-1' }), 150_000);
setTimeout(() => process.send?.({ stage: 'page-2' }), 260_000);
setInterval(() => {}, 1000);
