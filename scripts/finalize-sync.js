import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogHash, syncSummary, writeJson } from './scraper-progress.js';
import { validateCatalog } from './validate-data.js';

export function finalizeSync(root) {
  const read = file => JSON.parse(fs.readFileSync(new URL(file, root), 'utf8'));
  const state = read('.scraper-state/progress.json');
  const baseline = read('data/products.json');
  if (state.finalized || !state.complete || state.failed.length || state.baseHash !== catalogHash(baseline)) {
    throw new Error('抓取未完成或公开目录已变化，不能发布此检查点');
  }
  const products = read('.scraper-state/products.json');
  const errors = validateCatalog(products, read('data/product-brands.json'));
  if (errors.length) throw new Error(errors.join('\n'));
  const summary = syncSummary(baseline, products, state.startedAt);
  writeJson(fileURLToPath(new URL('data/products.json', root)), products);
  writeJson(fileURLToPath(new URL('data/sync-info.json', root)), summary);
  // 成功检查点作为缓存的结束标记；即使目录没变化，下轮也必须重新检查官网。
  state.finalized = true;
  writeJson(fileURLToPath(new URL('.scraper-state/progress.json', root)), state);
  console.log(`同步完成：新增 ${summary.addedKeys.length} 款，${summary.imageCountChanges.length} 款图片数量变化`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    finalizeSync(new URL('../', import.meta.url));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
