import { useState, useEffect } from "react";
import "./App.css";
import type { CarModel } from "./types";

interface Brand {
  name: string;
  logo: string;
}

function App() {
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<CarModel | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    // 从本地 JSON 文件加载数据
    const loadData = async () => {
      try {
        // 加载车模数据
        const carResponse = await fetch(`${import.meta.env.BASE_URL}products.json`);
        if (!carResponse.ok) {
          throw new Error("Failed to load car data");
        }
        const carData = await carResponse.json();
        setCarModels(carData);

        // 加载品牌数据
        const brandResponse = await fetch(`${import.meta.env.BASE_URL}product-brands.json`);
        if (!brandResponse.ok) {
          throw new Error("Failed to load brand data");
        }
        const brandData = await brandResponse.json();
        setBrands(brandData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // 从车模名称中提取品牌
  const extractBrand = (modelName: string): string => {
    // 简单的品牌提取逻辑，实际项目中可能需要更复杂的匹配
    const brandNames = brands.map((brand) => brand.name.toLowerCase());
    const words = modelName.split(" ");

    // 尝试匹配品牌名称
    for (let i = 0; i < words.length; i++) {
      for (let j = i; j < words.length; j++) {
        const potentialBrand = words
          .slice(i, j + 1)
          .join(" ")
          .toLowerCase();
        if (brandNames.includes(potentialBrand)) {
          return (
            brands.find((brand) => brand.name.toLowerCase() === potentialBrand)
              ?.name || ""
          );
        }
      }
    }
    return "";
  };

  const filteredModels = carModels.filter(
    (model) =>
      (model.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (selectedBrand === "" || extractBrand(model.name) === selectedBrand)
  );

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
      const res = await fetch(imageUrl, { mode: "cors" });
      const blob = await res.blob();

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
    } catch (err) {
      alert("下载失败，图片可能禁止跨域");
      console.error(err);
    }
  };

  const handleDownloadAllImages = async (model: CarModel) => {
    setDownloading(true);
    setDownloadProgress({ current: 0, total: model.images.length });

    try {
      for (let i = 0; i < model.images.length; i++) {
        await handleDownloadImage(model.images[i]);
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
              placeholder="搜索车模编号或名称..."
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
              value={selectedBrand}
              onChange={(e) => {
                setSelectedBrand(e.target.value);
                setCurrentPage(1); // 切换品牌时重置页码
              }}
              className="brand-select"
            >
              <option value="">全品牌</option>
              {brands.map((brand) => (
                <option key={brand.name} value={brand.name}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading">
            <p>加载中...</p>
          </div>
        ) : (
          <div className="main-content">
            <div className="car-grid">
              {currentModels.map((model) => (
                <div key={model.id} className="car-card">
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
