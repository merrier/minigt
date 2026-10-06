import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import axios from 'axios';
import { uploadImage } from './upload-images.js';

const originalPost = axios.post;
const originalToken = process.env.SUPERBED_TOKEN;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minigt-upload-test-'));
const imagePath = path.join(directory, 'test.png');
fs.writeFileSync(imagePath, 'test image');
const requests = [];
const token = 'test-only-api-key';

// 消费 multipart 流，验证实际字段并关闭文件流，不发送网络请求。
async function mockPost(url, form, options) {
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    form.on('data', chunk => chunks.push(Buffer.from(chunk)));
    form.on('end', () => resolve(Buffer.concat(chunks).toString()));
    form.on('error', reject);
    form.resume();
  });
  requests.push({ url, body, options });
  return { data: { err: 0, url: 'https://pic.imgdd.cc/i/test.png' } };
}

try {
  process.env.SUPERBED_TOKEN = ` ${token}\n`;
  axios.post = mockPost;
  assert.equal(await uploadImage(imagePath), 'https://pic.imgdd.cc/i/test.png');
  assert.equal(requests[0].url, 'https://api.superbed.cn/upload');
  assert.equal(requests[0].options.headers['X-API-Key'], undefined);
  assert.match(requests[0].body, /name="token"\r\n\r\ntest-only-api-key\r\n/);
  assert.match(requests[0].body, /name="file"; filename="test.png"/);
  assert.match(requests[0].body, /name="categories"\r\n\r\nminigt/);

  delete process.env.SUPERBED_TOKEN;
  await assert.rejects(uploadImage(imagePath), /SUPERBED_TOKEN/);
  assert.equal(requests.length, 1);

  process.env.SUPERBED_TOKEN = token;
  axios.post = async (...args) => {
    await mockPost(...args);
    throw Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401, data: { detail: `Invalid API key: ${token}` } },
    });
  };
  await assert.rejects(uploadImage(imagePath), error => {
    assert.match(error.message, /401.*Invalid API key/);
    assert.ok(!error.message.includes(token));
    return true;
  });
  assert.equal(requests.length, 2); // 401 不重试，也不转换为成功。

  for (const data of [{ err: 1, msg: 'Upload quota exceeded' }, { err: 0 }]) {
    axios.post = async (...args) => { await mockPost(...args); return { data }; };
    await assert.rejects(uploadImage(imagePath), /上传失败/);
  }

  // 在临时目录运行真实 CLI，确认失败退出、停止后续上传且保存已有成果。
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.mkdirSync(path.join(directory, 'data'));
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  fs.symlinkSync(path.resolve('node_modules'), path.join(directory, 'node_modules'));
  const script = path.join(directory, 'scripts', 'upload-images.js');
  fs.copyFileSync(new URL('./upload-images.js', import.meta.url), script);
  const dataFile = path.join(directory, 'data', 'products.json');
  fs.writeFileSync(dataFile, JSON.stringify([{ sku: 'TEST', images: ['test.png', 'test.png', 'test.png'] }]));
  const preload = path.join(directory, 'mock.mjs');
  fs.writeFileSync(preload, `
    import axios from 'axios';
    let calls = 0;
    axios.post = async (url, form) => {
      await new Promise((resolve, reject) => {
        form.on('end', resolve); form.on('error', reject); form.resume();
      });
      if (++calls === 1) return { data: { err: 0, url: 'https://pic.imgdd.cc/i/saved.png' } };
      if (calls > 2) throw new Error('Unexpected third upload');
      throw Object.assign(new Error('Unauthorized'), {
        response: { status: 401, data: { detail: 'Invalid API key' } }
      });
    };
  `);
  const cli = spawnSync(process.execPath, ['--import', preload, script], {
    encoding: 'utf8', env: { ...process.env, SUPERBED_TOKEN: token }, timeout: 15000,
  });
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stderr, /401.*Invalid API key/);
  assert.equal((cli.stdout.match(/上传图片:/g) || []).length, 2);
  assert.ok(!cli.stdout.includes('数据更新完成'));
  assert.deepEqual(JSON.parse(fs.readFileSync(dataFile))[0].images,
    ['https://pic.imgdd.cc/i/saved.png', 'test.png', 'test.png']);
  console.log('Superbed upload checks passed');
} finally {
  axios.post = originalPost;
  if (originalToken === undefined) delete process.env.SUPERBED_TOKEN;
  else process.env.SUPERBED_TOKEN = originalToken;
  fs.rmSync(directory, { recursive: true, force: true });
}
