import { useState, useEffect } from "react";
import "./App.css";
import type { Brand, CarModel } from "./types";
import { fetchImageBlob } from "./download";
import { filterModels, productKey } from "./filter";
import { loadCatalog } from "./catalog";

function App() {
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<CarModel | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);
  const [sortBy, setSortBy] = useState<"sku" | "name">("sku");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
  });

  useEffect(() => {
    const controller = new AbortController();
    // JSON 独立于脚本发布，每次加载时校验缓存，避免新脚本读取旧分类数据。
    const loadData = async () => {
      try {
        const data = await loadCatalog(import.meta.env.BASE_URL, controller.signal);
        if (controller.signal.aborted) return;
        // 两份数据都可用后再展示，避免分类失败时出现半份结果。
        setCarModels(data.products);
        setBrands(data.brands);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "数据加载失败，请稍后重试。");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadData();
    return () => controller.abort();
  }, [loadAttempt]);

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedBrand("");
    setCurrentPage(1);
  };
  const hasFilters = Boolean(searchTerm.trim() || selectedBrand);

  const filteredModels = filterModels(carModels, searchTerm, selectedBrand, brands);

  // 排序逻辑
  const sortedModels = [...filteredModels].sort((a, b) => {
    if (sortBy === "sku") {
      return sortOrder === "asc"
        ? a.sku.localeCompare(b.sku)
        : b.sku.localeCompare(a.sku);
    } else {
      return sortOrder === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    }
  });

  // 分页逻辑
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentModels = sortedModels.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedModels.length / itemsPerPage);

  // 下载 CDN 跨域图片
  const handleDownloadImage = async (imageUrl: string) => {
    try {
      // 1. 跨域获取图片
      const blob = await fetchImageBlob(imageUrl);

      // 2. 创建临时下载链接
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = imageUrl.split("/").pop() || "image.jpg"; // 下载文件名

      // 3. 触发下载
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 4. 释放内存
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      return true;
    } catch (err) {
      alert(`下载失败：${err instanceof Error ? err.message : "请稍后重试"}`);
      console.error(err);
      return false;
    }
  };

  const handleDownloadAllImages = async (model: CarModel) => {
    setDownloading(true);
    setDownloadProgress({ current: 0, total: model.images.length });

    try {
      for (let i = 0; i < model.images.length; i++) {
        if (!(await handleDownloadImage(model.images[i]))) break;
        setDownloadProgress({ current: i + 1, total: model.images.length });
        // 为了避免浏览器限制，添加小延迟
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error("下载全部图片失败:", error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>MINI GT 车模预览</h1>
        <div className="search-sort-container">
          <div className="search-container">
            <input
              type="text"
              aria-label="搜索车模编号、名称或分类"
              placeholder="搜索车模编号、名称或分类..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // 搜索时重置页码
              }}
              className="search-input"
            />
          </div>
          <div className="sort-container">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as "sku" | "name");
                setCurrentPage(1); // 排序时重置页码
              }}
              className="sort-select"
            >
              <option value="sku">按编号排序</option>
              <option value="name">按名称排序</option>
            </select>
            <button
              className="sort-btn"
              onClick={() => {
                setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                setCurrentPage(1); // 切换排序顺序时重置页码
              }}
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <div className="brand-container">
            <select
              aria-label="车模分类"
              value={selectedBrand}
              onChange={(e) => {
                setSelectedBrand(e.target.value);
                setCurrentPage(1); // 切换品牌时重置页码
              }}
              className="brand-select"
            >
              <option value="">全部分类</option>
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
          <div className="loading" role="status">
            <p>加载中...</p>
          </div>
        ) : loadError ? (
          <div className="catalog-state" role="alert">
            <h2>数据加载失败</h2>
            <p>{loadError}</p>
            <button className="catalog-action" onClick={() => {
              setLoadError("");
              setLoading(true);
              setLoadAttempt(attempt => attempt + 1);
            }}>重新加载</button>
          </div>
        ) : (
          <div className="main-content">
            <div className="results-summary">
              <p role="status">共 {sortedModels.length} 款车模{hasFilters ? `（全部 ${carModels.length} 款）` : ""}</p>
              {hasFilters && <button className="catalog-action" onClick={clearFilters}>清空筛选</button>}
            </div>
            {sortedModels.length === 0 && (
              <div className="catalog-state">
                <h2>{carModels.length ? "没有找到匹配的车模" : "暂无车型数据"}</h2>
                <p>{hasFilters ? "试试其他编号、名称或分类，或清空筛选查看全部车模。" : "请稍后再来查看。"}</p>
              </div>
            )}
            <div className="car-grid">
              {currentModels.map((model) => (
                <div key={productKey(model)} className="car-card">
                  <div className="car-card-header">
                    <h2 className="car-sku">{model.sku}</h2>
                    <div className="download-all-container">
                      <button
                        className="download-all-btn"
                        onClick={(e) => {
                          e.stopPropagation(); // 阻止事件冒泡，避免触发其他点击事件
                          handleDownloadAllImages(model);
                        }}
                        disabled={downloading}
                      >
                        {downloading ? "下载中..." : "下载全部"}
                      </button>
                      {downloading && (
                        <div className="download-progress">
                          <div
                            className="download-progress-bar"
                            style={{
                              width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
                            }}
                          ></div>
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="car-name">{model.name}</h3>
                  <div className="car-images">
                    {model.images.map((image, index) => (
                      <div key={index} className="image-container">
                        <img
                          src={image}
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                          alt={`${model.sku} - 图片 ${index + 1}`}
                          className="car-image"
                          onClick={() => {
                            setSelectedModel(model);
                            setSelectedImage(image);
                          }}
                        />
                        <button
                          className="download-btn"
                          onClick={(e) => {
                            e.stopPropagation(); // 阻止事件冒泡，避免触发图片点击
                            handleDownloadImage(image);
                          }}
                        >
                          下载
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 分页控件 */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                >
                  上一页
                </button>
                <div className="pagination-info">
                  第 {currentPage} 页，共 {totalPages} 页
                </div>
                <button
                  className="pagination-btn"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 图片预览模态框 */}
      {selectedImage && selectedModel && (
        <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setSelectedImage(null)}
            >
              ×
            </button>
            <h3>
              {selectedModel.sku} - {selectedModel.name}
            </h3>

            {/* 图片导航 */}
            <div className="modal-image-container">
              {selectedModel.images.length > 1 && (
                <button
                  className="modal-nav-btn modal-nav-btn-left"
                  onClick={() => {
                    const currentIndex =
                      selectedModel.images.indexOf(selectedImage);
                    const prevIndex =
                      currentIndex === 0
                        ? selectedModel.images.length - 1
                        : currentIndex - 1;
                    setSelectedImage(selectedModel.images[prevIndex]);
                  }}
                >
                  ←
                </button>
              )}

              <img
                src={selectedImage}
                alt={`${selectedModel.sku} 预览`}
                className="modal-image"
              />

              {selectedModel.images.length > 1 && (
                <button
                  className="modal-nav-btn modal-nav-btn-right"
                  onClick={() => {
                    const currentIndex =
                      selectedModel.images.indexOf(selectedImage);
                    const nextIndex =
                      currentIndex === selectedModel.images.length - 1
                        ? 0
                        : currentIndex + 1;
                    setSelectedImage(selectedModel.images[nextIndex]);
                  }}
                >
                  →
                </button>
              )}

              {/* 图片索引 */}
              <div className="modal-image-index">
                {selectedModel.images.indexOf(selectedImage) + 1} /{" "}
                {selectedModel.images.length}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="modal-download"
                onClick={() => handleDownloadImage(selectedImage)}
                disabled={downloading}
              >
                下载此图片
              </button>
              <div className="modal-download-all-container">
                <button
                  className="modal-download-all"
                  onClick={() => handleDownloadAllImages(selectedModel)}
                  disabled={downloading}
                >
                  {downloading ? "下载中..." : "下载全部图片"}
                </button>
                {downloading && (
                  <div className="download-progress">
                    <div
                      className="download-progress-bar"
                      style={{
                        width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
                      }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
