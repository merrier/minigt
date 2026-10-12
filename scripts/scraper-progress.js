import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const catalogHash = products => createHash('sha256').update(JSON.stringify(products)).digest('hex');
export const keyOf = product => product.sku || `id:${product.id}`;

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

export function openProgress(directory, baseline) {
  const file = path.join(directory, 'progress.json');
  const productsFile = path.join(directory, 'products.json');
  const baseHash = catalogHash(baseline);
  if (fs.existsSync(file) && fs.existsSync(productsFile)) {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (state.version === 1 && !state.finalized && state.baseHash === baseHash) {
      return { state, products: JSON.parse(fs.readFileSync(productsFile, 'utf8')) };
    }
  }
  // 检查点仅对同一份公开目录有效，不能覆盖后续人工修正。
  fs.rmSync(directory, { recursive: true, force: true });
  return {
    state: { version: 1, baseHash, startedAt: new Date().toISOString(), completed: [], failed: [], complete: false },
    products: structuredClone(baseline),
  };
}

export function saveProgress(directory, state, products) {
  writeJson(path.join(directory, 'products.json'), products);
  writeJson(path.join(directory, 'progress.json'), state);
}

// 两个请求在途；所有页面和图片请求共享起始间隔，重试也需要排队。
export function requestGate(interval = 1000) {
  let nextStart = 0;
  return async () => {
    const now = Date.now();
    const start = Math.max(now, nextStart);
    nextStart = start + interval;
    await new Promise(resolve => setTimeout(resolve, start - now));
  };
}

export async function runBatch(links, state, processLink, save, concurrency = 2) {
  const completed = new Set(state.completed);
  const failed = new Set(state.failed);
  const pending = [...new Set(links)].filter(link => !completed.has(link));
  let cursor = 0;
  let processed = 0;
  const persist = () => {
    state.completed = [...completed];
    state.failed = [...failed];
    save();
  };
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < pending.length) {
      const link = pending[cursor++];
      try {
        await processLink(link);
        completed.add(link);
        failed.delete(link);
      } catch (error) {
        failed.add(link);
        console.error(`处理产品失败: ${link}: ${error.message}`);
      }
      if (++processed % 10 === 0) persist();
    }
  }));
  persist();
}

export function syncSummary(baseline, products, startedAt, now = new Date().toISOString()) {
  const previous = new Map(baseline.map(product => [keyOf(product), product]));
  return {
    lastSuccessfulSync: now,
    startedAt,
    total: products.length,
    addedKeys: products.filter(product => !previous.has(keyOf(product))).map(keyOf),
    imageCountChanges: products.filter(product => previous.has(keyOf(product)) &&
      previous.get(keyOf(product)).images.length !== product.images.length)
      .map(product => ({ key: keyOf(product), from: previous.get(keyOf(product)).images.length, to: product.images.length })),
  };
}
