# MINI GT 车模预览

使用 Node.js 24（见 `.nvmrc`），运行 `npm ci` 安装依赖，`npm run dev` 启动本地页面。

- `npm test`：运行独立样例回归测试，不请求官网或真实图床。
- `npm run validate:data`：检查产品唯一性、关键字段、远程图片链接及官网分类引用。
- `npm run check`：依次运行 lint、测试、数据校验和包含类型检查的生产构建。

产品以完整 SKU 区分，保留地区变体；未编号产品以官网 ID 区分。官网未提供的比例、品牌、状态保留空字符串。分类成员来自官网，不按名称猜测；图片更新仍只比较数量。

发布、产品爬取和分类爬取工作流共用发布队列，发布前必须通过 `npm run check`。爬取期间若人工提交推进了 `dev`，自动任务会在 push 时失败，需基于新源码重跑，避免发布未经校验的合并结果。数据校验失败时保留原发布版本，不绕过检查。

## Vite 模板参考

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## 同步与失败恢复

定时同步统一由 `MINI GT Scraper` 执行，计划每天北京时间 20:00 触发，依次抓取车型、同步分类、上传图片、校验并发布。`Brand Scraper` 仅保留手动触发，不再独立定时运行，避免新分类引用尚未收录的车型而导致校验失败。

`npm run scrape` 以两个 worker 抓取详情，官网页面与图片请求共用至少 1 秒的起始间隔。每处理 10 个详情及每页结束保存一次 `.scraper-state/`，包含已完成 URL、失败 URL、待发布目录和待上传图片。重跑同一命令会跳过已完成详情，并重试失败项；只有新增和图片数量变化的车型需要下载图片。公开目录变化后检查点自动失效。

完整同步顺序：

```sh
npm run scrape
npm run scrape:brands
MINIGT_DATA_FILE=.scraper-state/products.json npm run upload-images
npm run sync:finalize
npm run check
```

上传仍使用环境变量 `SUPERBED_TOKEN`。`sync:finalize` 要求全部详情完成、图片均已上传、分类引用校验通过，之后才替换公开目录并生成 `data/sync-info.json`。抓取中断不会将半成品写入公开目录。GitHub Actions 自动保存检查点缓存，缓存绑定公开目录及脚本版本，失败后重新运行工作流即可恢复。成功同步后关闭本轮检查点，下次仍重新核验官网图片数量。需要从头抓取时删除 `.scraper-state/`；此目录不提交、不部署。

新车型从首次发现开始记录 `firstSeenAt`，历史车型不回填猜测日期。每次成功同步记录新增车型、图片数量变化和成功时间。已核对详情页的车型展示官网详情链接，尚未重新核对的历史车型按 SKU 链接到官网搜索。

## 浏览与下载

搜索、分类、排序和页码写入 URL；刷新、分享及浏览器前进后退均可恢复。收录时间排序将没有日期的历史记录放在最后。所有分类继续使用官网成员关系。

每款车可下载一个 ZIP；单张原图在预览窗口下载，文件名为 `SKU_01.jpg` 等。ZIP 不二次压缩图片，一张图片失败就显示错误并允许重试，不生成缺图压缩包。各车型独立显示进度。预览支持 Escape 关闭、左右方向键切图。

列表封面和缩略图使用 [Superbed 图片服务](https://www.superbed.cn/help) 的等比例 WebP 缩略图，失败时回退原图；放大预览和下载保留原图。首张封面优先加载，其余图片接近视口时才请求，目录 JSON 预加载并提前连接图床。

样式按 [taste-skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) 的既有页面优化原则实现，保留青色识别色和搜索入口，采用大图图录、统一间距、系统浅色/深色适配及减少动态效果设置。
