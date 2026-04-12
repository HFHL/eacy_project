/**
 * DocumentBboxViewer - 文档坐标溯源可视化组件
 * 
 * 功能：
 * - 左侧：文档图片预览，支持在指定坐标位置绘制高亮框
 * - 右侧：解析出的文本内容块列表
 * - 交互：鼠标悬停在文本块上时，左侧对应位置高亮显示
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Spin, Empty, Tag, Tooltip, Switch, Select, Slider, Badge } from 'antd';
import { 
  FileTextOutlined, 
  TableOutlined, 
  PictureOutlined,
  AimOutlined,
  ZoomInOutlined,
  ZoomOutOutlined
} from '@ant-design/icons';
import './styles.css';

const { Option } = Select;

/**
 * 内容块类型图标映射
 */
const TYPE_ICONS = {
  text: <FileTextOutlined />,
  table: <TableOutlined />,
  image: <PictureOutlined />,
  discarded: <FileTextOutlined style={{ opacity: 0.5 }} />
};

/**
 * 内容块类型颜色映射
 */
const TYPE_COLORS = {
  text: '#1890ff',      // 蓝色 - 文本
  table: '#52c41a',     // 绿色 - 表格
  image: '#722ed1',     // 紫色 - 图片
  discarded: '#999999'  // 灰色 - 丢弃内容
};

const buildPdfPreviewUrl = (url, pageIndex) => {
  if (!url) return url;
  const base = String(url).split('#')[0];
  return `${base}#page=${Math.max(0, pageIndex) + 1}`;
};

const PREVIEW_HORIZONTAL_PADDING = 32; // .preview-scroll-content 左右各 16px
const PREVIEW_VERTICAL_PADDING = 32;   // .preview-scroll-content 上下各 16px

/**
 * 标题级别样式
 */
const TITLE_STYLES = {
  1: { fontSize: 18, fontWeight: 700 },
  2: { fontSize: 16, fontWeight: 600 },
  3: { fontSize: 15, fontWeight: 600 },
  4: { fontSize: 14, fontWeight: 500 },
  5: { fontSize: 13, fontWeight: 500 },
  6: { fontSize: 12, fontWeight: 500 }
};

/**
 * 图片预览区域组件
 */
const ImagePreviewArea = ({ 
  imageUrl, 
  fileType,
  contentList, 
  activeBlockIndex,
  hoveredBlockIndex,
  pageIndex,
  scale,
  showAllBoxes,
  onImageLoad,
  sensitiveRegions = [],
  pageAngle = 0,
}) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  // 过滤当前页面的内容块
  const currentPageBlocks = contentList.filter(block => block.page_idx === pageIndex);

  // 100% 缩放以容器可视宽度为基准，确保 300% 真正是可视宽度的 3 倍
  const fitScale = imageSize.width > 0
    ? Math.max((Math.max(containerWidth - PREVIEW_HORIZONTAL_PADDING, 1) / imageSize.width), 0.01)
    : 1;
  const renderScale = fitScale * scale;

  // 跟踪滚动容器宽度变化，避免窗口尺寸变化后缩放基准失真
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setContainerWidth(container.clientWidth || 0);
    };
    updateWidth();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateWidth);
      observer.observe(container);
    } else {
      window.addEventListener('resize', updateWidth);
    }

    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', updateWidth);
    };
  }, []);

  // 绘制高亮框
  const drawHighlightBoxes = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = imageSize;
    
    // 设置 canvas 尺寸（按“容器基准缩放”后的实际渲染尺寸）
    canvas.width = width * renderScale;
    canvas.height = height * renderScale;
    
    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 计算缩放比例（bbox 是 0-1000 范围）
    const scaleX = (width * renderScale) / 1000;
    const scaleY = (height * renderScale) / 1000;

    // 绘制所有框（半透明）
    if (showAllBoxes) {
      currentPageBlocks.forEach((block, idx) => {
        const globalIdx = contentList.findIndex(b => b === block);
        if (globalIdx === hoveredBlockIndex || globalIdx === activeBlockIndex) return;
        
        const bbox = block.bbox;
        if (!bbox || bbox.length !== 4) return;

        const [x1, y1, x2, y2] = bbox;
        const x = x1 * scaleX;
        const y = y1 * scaleY;
        const w = (x2 - x1) * scaleX;
        const h = (y2 - y1) * scaleY;

        ctx.strokeStyle = TYPE_COLORS[block.type] || '#999';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.strokeRect(x, y, w, h);
      });
    }

    // 绘制活跃/悬停的框（高亮）
    const highlightIndex = hoveredBlockIndex !== null ? hoveredBlockIndex : activeBlockIndex;
    if (highlightIndex !== null) {
      const block = contentList[highlightIndex];
      if (block && block.page_idx === pageIndex) {
        const bbox = block.bbox;
        if (bbox && bbox.length === 4) {
          const [x1, y1, x2, y2] = bbox;
          const x = x1 * scaleX;
          const y = y1 * scaleY;
          const w = (x2 - x1) * scaleX;
          const h = (y2 - y1) * scaleY;

          // 绘制填充
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = TYPE_COLORS[block.type] || '#1890ff';
          ctx.fillRect(x, y, w, h);

          // 绘制边框
          ctx.globalAlpha = 1;
          ctx.strokeStyle = TYPE_COLORS[block.type] || '#1890ff';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);

          // 绘制角标
          ctx.globalAlpha = 1;
          ctx.fillStyle = TYPE_COLORS[block.type] || '#1890ff';
          ctx.fillRect(x, y - 20, 60, 20);
          ctx.fillStyle = '#fff';
          ctx.font = '12px sans-serif';
          ctx.fillText(`#${highlightIndex + 1}`, x + 4, y - 6);
        }
      }
    }

    // 绘制敏感区域遮盖（黑色矩形）
    if (sensitiveRegions && sensitiveRegions.length > 0) {
      const pageRegions = sensitiveRegions.filter(r => r.page_idx === pageIndex);
      pageRegions.forEach(region => {
        const bbox = region.bbox;
        if (!bbox || bbox.length !== 4) return;
        const [rx1, ry1, rx2, ry2] = bbox;
        const rx = rx1 * scaleX;
        const ry = ry1 * scaleY;
        const rw = (rx2 - rx1) * scaleX;
        const rh = (ry2 - ry1) * scaleY;

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000000';
        ctx.fillRect(rx, ry, rw, rh);
      });
    }

    ctx.globalAlpha = 1;
  }, [contentList, currentPageBlocks, activeBlockIndex, hoveredBlockIndex, pageIndex, renderScale, showAllBoxes, imageSize, imageLoaded, sensitiveRegions]);

  // 图片加载完成
  const handleImageLoad = () => {
    const img = imageRef.current;
    if (img) {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
      onImageLoad?.({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  // 重绘
  useEffect(() => {
    drawHighlightBoxes();
  }, [drawHighlightBoxes]);

  // 滚动到高亮区域
  useEffect(() => {
    if (hoveredBlockIndex === null || !containerRef.current || !imageLoaded) return;
    
    const block = contentList[hoveredBlockIndex];
    if (!block || block.page_idx !== pageIndex) return;
    
    const bbox = block.bbox;
    if (!bbox || bbox.length !== 4) return;

    const { height } = imageSize;
    const scaleY = (height * renderScale) / 1000;
    const y = bbox[1] * scaleY;
    
    // 滚动到目标位置
    containerRef.current.scrollTo({
      top: Math.max(0, y - 100),
      behavior: 'smooth'
    });
  }, [hoveredBlockIndex, contentList, pageIndex, renderScale, imageSize, imageLoaded]);

  // 缩放/旋转变化后，将视图锚定到左上角，明确舍弃“中心放大”
  useEffect(() => {
    if (!containerRef.current || !imageLoaded) return;
    containerRef.current.scrollTo({
      left: 0,
      top: 0,
      behavior: 'auto',
    });
  }, [scale, pageAngle, imageLoaded]);

  if (!imageUrl) {
    return (
      <div className="preview-empty">
        <Empty description="请选择要预览的文档" />
      </div>
    );
  }

  if (fileType === 'pdf') {
    return (
      <div className="preview-container" ref={containerRef}>
        <iframe
          title="Document preview"
          src={buildPdfPreviewUrl(imageUrl, pageIndex)}
          style={{ width: '100%', minHeight: 640, border: 0, background: '#fff' }}
        />
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 4, background: '#fffbe6', border: '1px solid #ffe58f', color: '#ad6800', fontSize: 12 }}>
          PDF 已改为原文档预览模式，不再调用页图渲染接口，因此左侧不显示 bbox 高亮框。
        </div>
      </div>
    );
  }

  // 计算缩放后的尺寸
  const scaledWidth = imageSize.width * renderScale;
  const scaledHeight = imageSize.height * renderScale;

  // Textin 坐标基于原始图像（straighten=0），需要客户端旋转还原方向
  const needsClientRotation = pageAngle && pageAngle !== 0;

  // 旋转后视觉边界框尺寸（用于撑开滚动容器，确保所有内容均可滚动到）
  // 关键：使用 top-left 作为 transformOrigin，按旋转后的 minX/minY 做正向偏移。
  // 这样可以避免“中心旋转”带来的滚动作用域错位。
  let scrollBoxWidth = scaledWidth;
  let scrollBoxHeight = scaledHeight;
  let innerOffsetX = 0;
  let innerOffsetY = 0;

  if (needsClientRotation && scaledWidth > 0 && scaledHeight > 0) {
    const theta = (-pageAngle * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const corners = [
      { x: 0, y: 0 },
      { x: scaledWidth, y: 0 },
      { x: 0, y: scaledHeight },
      { x: scaledWidth, y: scaledHeight },
    ].map(({ x, y }) => ({
      x: x * cosT - y * sinT,
      y: x * sinT + y * cosT,
    }));
    const minX = Math.min(...corners.map(p => p.x));
    const maxX = Math.max(...corners.map(p => p.x));
    const minY = Math.min(...corners.map(p => p.y));
    const maxY = Math.max(...corners.map(p => p.y));

    scrollBoxWidth = Math.ceil(maxX - minX);
    scrollBoxHeight = Math.ceil(maxY - minY);
    innerOffsetX = -minX;
    innerOffsetY = -minY;
  }

  const padX = PREVIEW_HORIZONTAL_PADDING / 2;
  const padY = PREVIEW_VERTICAL_PADDING / 2;
  const scrollContentWidth = Math.max(
    Math.ceil((scrollBoxWidth || 0) + PREVIEW_HORIZONTAL_PADDING),
    containerWidth || 0
  );
  const scrollContentHeight = Math.ceil((scrollBoxHeight || 0) + PREVIEW_VERTICAL_PADDING);

  return (
    <div className="preview-container" ref={containerRef}>
      <div
        className="preview-scroll-content"
        style={{
          width: scrollContentWidth || '100%',
          height: scrollContentHeight || '100%',
        }}
      >
        <div
          className={`preview-image-wrapper ${scale !== 1 ? 'scaled' : ''}`}
          style={{
            position: 'absolute',
            left: padX + innerOffsetX,
            top: padY + innerOffsetY,
            width: scaledWidth || 'auto',
            height: scaledHeight || 'auto',
            ...(needsClientRotation ? {
              transform: `rotate(${-pageAngle}deg)`,
              transformOrigin: 'top left',
            } : {}),
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Document preview"
            onLoad={handleImageLoad}
            style={{
              display: imageLoaded ? 'block' : 'none',
              width: scaledWidth || '100%',
              height: scaledHeight || 'auto',
              ...(needsClientRotation ? { imageOrientation: 'none' } : {}),
            }}
          />
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
            }}
          />
          {!imageLoaded && (
            <div className="preview-loading">
              <Spin tip="加载中..." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * 内容块列表组件
 */
const ContentBlockList = ({
  contentList,
  activeBlockIndex,
  onBlockHover,
  onBlockClick,
  filterType
}) => {
  // 过滤内容块
  const filteredList = filterType === 'all' 
    ? contentList 
    : contentList.filter(block => block.type === filterType);

  if (!contentList || contentList.length === 0) {
    return (
      <div className="content-empty">
        <Empty description="暂无解析内容" />
      </div>
    );
  }

  return (
    <div className="content-list">
      {filteredList.map((block, idx) => {
        const globalIndex = contentList.indexOf(block);
        const isActive = globalIndex === activeBlockIndex;
        const titleStyle = block.text_level ? TITLE_STYLES[block.text_level] : {};
        
        return (
          <div
            key={globalIndex}
            className={`content-block ${isActive ? 'active' : ''} type-${block.type}`}
            onMouseEnter={() => onBlockHover(globalIndex)}
            onMouseLeave={() => onBlockHover(null)}
            onClick={() => onBlockClick(globalIndex)}
          >
            <div className="block-header">
              <span className="block-index">#{globalIndex + 1}</span>
              <Tag 
                color={TYPE_COLORS[block.type]} 
                icon={TYPE_ICONS[block.type]}
                style={{ marginLeft: 8 }}
              >
                {block.type}
                {block.text_level && ` H${block.text_level}`}
              </Tag>
              <span className="block-page">P{block.page_idx + 1}</span>
            </div>
            
            <div className="block-content" style={titleStyle}>
              {block.type === 'text' && (
                <div className="text-content">
                  {block.text || '(空文本)'}
                </div>
              )}
              
              {block.type === 'table' && (
                <div className="table-content">
                  <Tooltip title="点击查看表格详情">
                    <span>📊 表格内容</span>
                  </Tooltip>
                  {block.table_body && (
                    <div 
                      className="table-preview"
                      dangerouslySetInnerHTML={{ __html: block.table_body }}
                    />
                  )}
                </div>
              )}
              
              {block.type === 'image' && (
                <div className="image-content">
                  <PictureOutlined /> 图片: {block.img_path || '未知'}
                </div>
              )}
              
              {block.type === 'discarded' && (
                <div className="discarded-content">
                  {block.text || '(丢弃内容)'}
                </div>
              )}
            </div>
            
            <div className="block-bbox">
              <Tooltip title="坐标: [x1, y1, x2, y2] (0-1000 范围)">
                <code>
                  [{block.bbox?.join(', ') || 'N/A'}]
                </code>
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * 主组件
 */
const DocumentBboxViewer = ({
  imageUrl,           // 文档图片 URL
  fileType = 'image', // 文档类型
  contentList = [],   // 内容块列表（含 bbox）
  loading = false,    // 加载状态
  pageIndex = 0,      // 当前页码
  onPageChange,       // 页码变化回调
  totalPages = 1,     // 总页数
  title = '文档坐标溯源',
  sensitiveRegions = [], // 脱敏区域坐标列表
  pageAngle = 0,      // 非 PDF 图片的客户端旋转角度（PDF 已在后端处理）
}) => {
  const [activeBlockIndex, setActiveBlockIndex] = useState(null);
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState(null);
  const [scale, setScale] = useState(1);
  const [showAllBoxes, setShowAllBoxes] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const isPdf = fileType === 'pdf';

  // 统计各类型数量
  const typeCounts = contentList.reduce((acc, block) => {
    acc[block.type] = (acc[block.type] || 0) + 1;
    return acc;
  }, {});

  const handleBlockHover = (index) => {
    setHoveredBlockIndex(index);
  };

  const handleBlockClick = (index) => {
    setActiveBlockIndex(activeBlockIndex === index ? null : index);
  };

  const handleZoomIn = () => setScale(s => Math.min(s + 0.05, 3));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.05, 0.05));

  return (
    <div className="document-bbox-viewer">
      {/* 工具栏 */}
      <div className="viewer-toolbar">
        <div className="toolbar-left">
          <span className="viewer-title">{title}</span>
          <Badge count={contentList.length} style={{ backgroundColor: '#1890ff' }}>
            <span style={{ marginLeft: 8 }}>内容块</span>
          </Badge>
        </div>
        
        <div className="toolbar-center">
          {isPdf ? (
            <span style={{ color: '#999' }}>PDF 原文档预览模式</span>
          ) : (
            <>
              <span style={{ marginRight: 8 }}>缩放:</span>
              <ZoomOutOutlined onClick={handleZoomOut} style={{ cursor: 'pointer', marginRight: 8 }} />
              <Slider 
                value={scale} 
                min={0.05} 
                max={3} 
                step={0.05}
                onChange={setScale}
                style={{ width: 100 }}
              />
              <ZoomInOutlined onClick={handleZoomIn} style={{ cursor: 'pointer', marginLeft: 8 }} />
              <span style={{ marginLeft: 8 }}>{Math.round(scale * 100)}%</span>
            </>
          )}
        </div>
        
        <div className="toolbar-right">
          {!isPdf && (
            <>
              <span style={{ marginRight: 8 }}>显示全部框:</span>
              <Switch checked={showAllBoxes} onChange={setShowAllBoxes} size="small" />
            </>
          )}
          
          <Select 
            value={filterType}
            onChange={setFilterType}
            style={{ width: 120, marginLeft: 16 }}
            size="small"
          >
            <Option value="all">全部 ({contentList.length})</Option>
            <Option value="text">文本 ({typeCounts.text || 0})</Option>
            <Option value="table">表格 ({typeCounts.table || 0})</Option>
            <Option value="image">图片 ({typeCounts.image || 0})</Option>
          </Select>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="viewer-content">
        {loading ? (
          <div className="viewer-loading">
            <Spin size="large" tip="解析中..." />
          </div>
        ) : (
          <>
            {/* 左侧：图片预览 */}
            <div className="viewer-left">
              <div className="panel-header">
                <AimOutlined /> 文档预览
                {totalPages > 1 && (
                  <Select 
                    value={pageIndex}
                    onChange={onPageChange}
                    size="small"
                    style={{ marginLeft: 16, width: 100 }}
                  >
                    {Array.from({ length: totalPages }, (_, i) => (
                      <Option key={i} value={i}>第 {i + 1} 页</Option>
                    ))}
                  </Select>
                )}
              </div>
              <ImagePreviewArea
                imageUrl={imageUrl}
                fileType={fileType}
                contentList={contentList}
                activeBlockIndex={activeBlockIndex}
                hoveredBlockIndex={hoveredBlockIndex}
                pageIndex={pageIndex}
                scale={scale}
                showAllBoxes={showAllBoxes}
                sensitiveRegions={sensitiveRegions}
                pageAngle={pageAngle}
              />
            </div>

            {/* 右侧：内容块列表 */}
            <div className="viewer-right">
              <div className="panel-header">
                <FileTextOutlined /> 解析内容
              </div>
              <ContentBlockList
                contentList={contentList}
                activeBlockIndex={activeBlockIndex}
                onBlockHover={handleBlockHover}
                onBlockClick={handleBlockClick}
                filterType={filterType}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentBboxViewer;

