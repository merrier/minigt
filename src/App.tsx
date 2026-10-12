import { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  Cross2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  Link2Icon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import "./App.css";
import type { Brand, CarModel, SyncInfo } from "./types";
import {
  createModelZip,
  fetchImageBlob,
  imageFilename,
  modelFilename,
  saveBlob,
} from "./download";
import { filterModels, productKey } from "./filter";
import { loadCatalog, loadSyncInfo } from "./catalog";
import { readView, sortModels, viewUrl, type ViewState } from "./view-state";

type DownloadState = {
  busy: boolean;
  current: number;
  total: number;
  message: string;
  error?: boolean;
};
const statusLabels: Record<string, string> = {
  "Pre-Order": "预售中",
  Released: "已发售",
  "In Stock": "有现货",
  "Sold Out": "已售罄",
};
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("zh-CN");

function CatalogImage({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(priority);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (visible || !ref.current) return;
    // 原图较大，限制预加载距离，避免屏幕下方的图片抢占首屏带宽。
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  return failed ? (
    <span className="image-fallback">图片暂时无法加载</span>
  ) : (
    <img
      ref={ref}
      src={visible || priority ? src : undefined}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function DownloadButton({
  state,
  onClick,
}: {
  state?: DownloadState;
  onClick: () => void;
}) {
  return (
    <div className="download-control">
      <button
        className="download-all-btn"
        onClick={onClick}
        disabled={state?.busy}
      >
        <DownloadIcon />
        {state?.busy
          ? `正在下载 ${state.current}/${state.total}`
          : "下载全部 ZIP"}
      </button>
      {state?.busy && (
        <progress
          aria-label="图片下载进度"
          value={state.current}
          max={state.total}
        />
      )}
      {state?.message && (
        <p
          className={state.error ? "download-error" : "download-note"}
          role={state.error ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

function ModelCard({
  model,
  download,
  onDownload,
  onPreview,
  priority,
}: {
  model: CarModel;
  download?: DownloadState;
  onDownload: () => void;
  priority: boolean;
  onPreview: (model: CarModel, index: number) => void;
}) {
  const [active, setActive] = useState(0);
  const sourceUrl =
    model.sourceUrl ||
    (model.sku
      ? `https://minigt.tsm-models.com/index.php?action=product-search&keywords=${encodeURIComponent(model.sku)}`
      : "");
  return (
    <article className="car-card">
      <button
        className="cover-image"
        onClick={(event) => {
          event.currentTarget.focus();
          onPreview(model, active);
        }}
        aria-label={`预览 ${model.sku || model.name} 图片 ${active + 1}`}
      >
        <CatalogImage
          key={model.images[active]}
          src={model.images[active]}
          alt={model.name}
          priority={priority}
        />
      </button>
      <div className="card-body">
        <div className="car-card-header">
          <h2 className="car-sku">{model.sku || "未编号"}</h2>
          <span className="image-count">{model.images.length} 张图片</span>
        </div>
        <h3 className="car-name">{model.name}</h3>
        <div className="model-meta">
          <span
            className={model.status === "Pre-Order" ? "status-preorder" : ""}
          >
            {statusLabels[model.status] || model.status || "状态未提供"}
          </span>
          <span>{model.scale || "比例未提供"}</span>
        </div>
        {model.images.length > 1 && (
          <div className="car-thumbnails" aria-label={`${model.sku} 图片选择`}>
            {model.images.map((image, index) => (
              <button
                key={image}
                className={
                  index === active ? "thumbnail selected" : "thumbnail"
                }
                aria-label={`${model.sku} 第 ${index + 1} 张`}
                aria-pressed={index === active}
                onClick={() => setActive(index)}
              >
                <CatalogImage
                  src={image}
                  alt={`${model.sku} 图片 ${index + 1}`}
                />
              </button>
            ))}
          </div>
        )}
        <div className="card-details">
          <span>
            {model.firstSeenAt
              ? `${formatDate(model.firstSeenAt)} 收录`
              : "历史收录"}
          </span>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              {model.sourceUrl ? "官网详情" : "官网搜索"}
              <ExternalLinkIcon />
            </a>
          )}
        </div>
        <DownloadButton state={download} onClick={onDownload} />
      </div>
    </article>
  );
}

function ImageDialog({
  model,
  initialIndex,
  download,
  onDownload,
  onClose,
}: {
  model: CarModel;
  initialIndex: number;
  download?: DownloadState;
  onDownload: (index?: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const move = (offset: number) =>
    setIndex(
      (value) => (value + offset + model.images.length) % model.images.length,
    );
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="image-dialog"
      aria-labelledby="preview-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") move(-1);
        if (e.key === "ArrowRight") move(1);
      }}
    >
      <div className="dialog-header">
        <div>
          <p className="car-sku">{model.sku || "未编号"}</p>
          <h2 id="preview-title">{model.name}</h2>
        </div>
        <button className="icon-button" aria-label="关闭预览" onClick={onClose}>
          <Cross2Icon />
        </button>
      </div>
      <div className="preview-image">
        <CatalogImage
          key={model.images[index]}
          src={model.images[index]}
          alt={`${model.name} 图片 ${index + 1}`}
          priority
        />
      </div>
      <div className="dialog-navigation">
        <button
          className="icon-button"
          aria-label="上一张图片"
          onClick={() => move(-1)}
          disabled={model.images.length === 1}
        >
          <ArrowLeftIcon />
        </button>
        <span>
          第 {index + 1} 张 / 共 {model.images.length} 张
        </span>
        <button
          className="icon-button"
          aria-label="下一张图片"
          onClick={() => move(1)}
          disabled={model.images.length === 1}
        >
          <ArrowRightIcon />
        </button>
      </div>
      <div className="dialog-actions">
        <button
          className="secondary-button"
          onClick={() => onDownload(index)}
          disabled={download?.busy}
        >
          <DownloadIcon />
          下载此图片
        </button>
        <DownloadButton state={download} onClick={() => onDownload()} />
      </div>
    </dialog>
  );
}

function App() {
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [view, setView] = useState(() => readView(window.location.search));
  const [preview, setPreview] = useState<{
    model: CarModel;
    index: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const downloadLocks = useRef(new Set<string>());
  const [shareMessage, setShareMessage] = useState("");
  const [shareFallback, setShareFallback] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadCatalog(import.meta.env.BASE_URL, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setCarModels(data.products);
        setBrands(data.brands);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error
              ? error.message
              : "数据加载失败，请稍后重试。",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    loadSyncInfo(import.meta.env.BASE_URL, controller.signal).then((info) => {
      if (!controller.signal.aborted) setSyncInfo(info);
    });
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    const restore = () => setView(readView(window.location.search));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const sortedModels = useMemo(
    () =>
      sortModels(
        filterModels(carModels, view.q, view.category, brands),
        view.sort,
        view.order,
      ),
    [carModels, brands, view.q, view.category, view.sort, view.order],
  );
  const totalPages = Math.max(1, Math.ceil(sortedModels.length / 12));
  const currentPage = Math.min(view.page, totalPages);
  const currentModels = sortedModels.slice(
    (currentPage - 1) * 12,
    currentPage * 12,
  );
  const hasFilters = Boolean(view.q.trim() || view.category);
  // 外部链接页码可能超出筛选结果，浏览和分享都使用实际有效页码。
  useEffect(() => {
    if (!loading && !loadError)
      window.history.replaceState(
        null,
        "",
        viewUrl(window.location.href, { ...view, page: currentPage }),
      );
  }, [view, currentPage, loading, loadError]);

  const changeView = (patch: Partial<ViewState>, replace = false) => {
    const next = { ...view, page: 1, ...patch };
    window.history[replace ? "replaceState" : "pushState"](
      null,
      "",
      viewUrl(window.location.href, next),
    );
    setView(next);
    setShareMessage("");
    setShareFallback(false);
  };

  const downloadImages = async (model: CarModel, index?: number) => {
    const key = productKey(model);
    if (downloadLocks.current.has(key)) return;
    downloadLocks.current.add(key);
    const total = index === undefined ? model.images.length : 1;
    const update = (patch: Partial<DownloadState>) =>
      setDownloads((previous) => ({
        ...previous,
        [key]: { ...previous[key], ...patch },
      }));
    update({ busy: true, current: 0, total, message: "", error: false });
    try {
      if (index === undefined) {
        const zip = await createModelZip(model, (current) =>
          update({ current }),
        );
        saveBlob(zip, `${modelFilename(model)}.zip`);
      } else {
        const blob = await fetchImageBlob(model.images[index]);
        saveBlob(blob, imageFilename(model, index, blob.type));
        update({ current: 1 });
      }
      update({ message: "已交给浏览器保存" });
    } catch (error) {
      update({
        error: true,
        message: `下载失败：${error instanceof Error ? error.message : "请重试"}`,
      });
    } finally {
      update({ busy: false });
      downloadLocks.current.delete(key);
    }
  };

  const share = async () => {
    const url = viewUrl(window.location.href, { ...view, page: currentPage });
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("链接已复制，包含当前搜索与筛选条件");
    } catch {
      setShareFallback(true);
      setShareMessage("请复制下方链接");
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="brand-line">
            <span className="brand-mark">MINI GT</span>
            <span>车模图片档案</span>
          </div>
          <div className="heading-row">
            <div>
              <h1>MINI GT 车模预览</h1>
              <p className="intro">查找心仪的车型，浏览每一处细节。</p>
            </div>
            <div className="catalog-total">
              <strong>
                {loading || loadError ? "…" : carModels.length.toLocaleString()}
              </strong>
              <span>款车模已收录</span>
            </div>
          </div>
          <div className="search-sort-container">
            <label className="search-container">
              <MagnifyingGlassIcon />
              <input
                type="search"
                aria-label="搜索车模编号、名称或分类"
                placeholder="搜索编号、名称或分类"
                value={view.q}
                onChange={(e) => changeView({ q: e.target.value }, true)}
              />
            </label>
            <div className="sort-container">
              <select
                aria-label="排序方式"
                value={view.sort}
                onChange={(e) =>
                  changeView({
                    sort: e.target.value as ViewState["sort"],
                    order: e.target.value === "recent" ? "desc" : "asc",
                  })
                }
              >
                <option value="sku">按编号排序</option>
                <option value="name">按名称排序</option>
                <option value="recent">按收录时间排序</option>
              </select>
              <button
                className="icon-button"
                aria-label={view.order === "asc" ? "切换为降序" : "切换为升序"}
                onClick={() =>
                  changeView({ order: view.order === "asc" ? "desc" : "asc" })
                }
              >
                {view.order === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
              </button>
            </div>
            <select
              className="brand-select"
              aria-label="车模分类"
              value={view.category}
              onChange={(e) => changeView({ category: e.target.value })}
            >
              <option value="">全部分类</option>
              {view.category &&
                !brands.some((brand) => brand.id === view.category) && (
                  <option value={view.category}>未知分类</option>
                )}
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>
      <main className="app-main">
        {loading ? (
          <div role="status" className="loading">
            <p>正在加载车模目录…</p>
            <div className="skeleton-grid" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} />
              ))}
            </div>
          </div>
        ) : loadError ? (
          <div className="catalog-state" role="alert">
            <h2>数据加载失败</h2>
            <p>{loadError}</p>
            <button
              className="secondary-button"
              onClick={() => {
                setLoadError("");
                setLoading(true);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              重新加载
            </button>
          </div>
        ) : (
          <>
            <div className="sync-summary">
              {syncInfo ? (
                <details>
                  <summary>
                    最近同步{" "}
                    {new Date(syncInfo.lastSuccessfulSync).toLocaleString(
                      "zh-CN",
                      { hour12: false },
                    )}
                    <span>
                      新增 {syncInfo.addedKeys.length} 款，图片数量变化{" "}
                      {syncInfo.imageCountChanges.length} 款
                    </span>
                  </summary>
                  <div className="sync-details">
                    {!syncInfo.addedKeys.length &&
                      !syncInfo.imageCountChanges.length && (
                        <p>本次没有新增车型或图片数量变化。</p>
                      )}
                    {syncInfo.addedKeys.map((key) => (
                      <button
                        key={key}
                        onClick={() =>
                          changeView({
                            q: key.startsWith("id:")
                              ? carModels.find((model) => productKey(model) === key)
                                  ?.name || key
                              : key,
                            category: "",
                            sort: "recent",
                            order: "desc",
                          })
                        }
                      >
                        新增 {key}
                      </button>
                    ))}
                    {syncInfo.imageCountChanges.map((item) => (
                      <button
                        key={item.key}
                        onClick={() =>
                          changeView({
                            q: item.key.startsWith("id:")
                              ? carModels.find((model) => productKey(model) === item.key)
                                  ?.name || item.key
                              : item.key,
                            category: "",
                          })
                        }
                      >
                        {item.key}：{item.from} 张 → {item.to} 张
                      </button>
                    ))}
                  </div>
                </details>
              ) : (
                <p>暂未提供同步记录</p>
              )}
            </div>
            <div className="results-summary">
              <div>
                <h2>
                  {brands.find((brand) => brand.id === view.category)?.name ||
                    (view.category ? "未知分类" : "全部车模")}
                </h2>
                <p role="status">
                  共 {sortedModels.length} 款
                  {hasFilters ? ` / 全部 ${carModels.length} 款` : ""}
                </p>
              </div>
              <div className="results-actions">
                {hasFilters && (
                  <button
                    className="text-button"
                    onClick={() => changeView({ q: "", category: "" })}
                  >
                    <Cross2Icon />
                    清空筛选
                  </button>
                )}
                <button className="secondary-button" onClick={share}>
                  <Link2Icon />
                  复制分享链接
                </button>
              </div>
            </div>
            {shareMessage && (
              <p className="share-message" role="status">
                {shareMessage}
              </p>
            )}
            {shareFallback && (
              <input
                className="share-url"
                aria-label="分享链接"
                readOnly
                value={viewUrl(window.location.href, {
                  ...view,
                  page: currentPage,
                })}
                onFocus={(e) => e.target.select()}
              />
            )}
            {view.sort === "recent" && (
              <p className="sort-note">
                收录时间从本次功能启用后记录，历史车型排在有日期的车型之后。
              </p>
            )}
            {!sortedModels.length && (
              <div className="catalog-state">
                <MagnifyingGlassIcon />
                <h2>
                  {carModels.length ? "没有找到匹配的车模" : "暂无车型数据"}
                </h2>
                <p>
                  {hasFilters
                    ? "试试其他编号、名称或分类，或清空筛选查看全部车模。"
                    : "请稍后再来查看。"}
                </p>
              </div>
            )}
            <div className="car-grid">
              {currentModels.map((model, index) => (
                <ModelCard
                  key={productKey(model)}
                  model={model}
                  download={downloads[productKey(model)]}
                  onDownload={() => downloadImages(model)}
                  onPreview={(model, index) => setPreview({ model, index })}
                  priority={index === 0}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <nav className="pagination" aria-label="车型分页">
                <button
                  className="secondary-button"
                  onClick={() => changeView({ page: currentPage - 1 })}
                  disabled={currentPage === 1}
                >
                  <ArrowLeftIcon />
                  上一页
                </button>
                <span>
                  第 {currentPage} 页 / 共 {totalPages} 页
                </span>
                <button
                  className="secondary-button"
                  onClick={() => changeView({ page: currentPage + 1 })}
                  disabled={currentPage === totalPages}
                >
                  下一页
                  <ArrowRightIcon />
                </button>
              </nav>
            )}
          </>
        )}
      </main>
      <footer className="app-footer">
        <span>MINI GT 车模图片档案</span>
        <a
          href="https://minigt.tsm-models.com/index.php?action=product-list"
          target="_blank"
          rel="noreferrer"
        >
          浏览官网
          <ExternalLinkIcon />
        </a>
      </footer>
      {preview && (
        <ImageDialog
          key={`${productKey(preview.model)}-${preview.index}`}
          model={preview.model}
          initialIndex={preview.index}
          download={downloads[productKey(preview.model)]}
          onDownload={(index) => downloadImages(preview.model, index)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

export default App;
