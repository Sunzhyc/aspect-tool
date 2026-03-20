import React, { useState, useRef, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ArrowRightLeft } from 'lucide-react';

interface ImageState {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  aspect: string;
  customW: string;
  customH: string;
  cropCenter: { x: number; y: number };
  scale: number;
}

const Cross = ({ className }: { className?: string }) => (
  <svg className={`absolute w-2 h-2 text-black ${className}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M6 0v12M0 6h12" />
  </svg>
);

export default function App() {
  const [images, setImages] = useState<ImageState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exportFormat, setExportFormat] = useState('original');
  const [applyToAll, setApplyToAll] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [customFilename, setCustomFilename] = useState('image');
  const [isExporting, setIsExporting] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCropCenter, setInitialCropCenter] = useState({ x: 0.5, y: 0.5 });

  // Touch zoom state
  const [touchDist, setTouchDist] = useState(0);

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [images.length]);

  const handleFiles = (files: FileList | File[]) => {
    const newImages: ImageState[] = [];
    let loadedCount = 0;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        loadedCount++;
        return;
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        newImages.push({
          id: Math.random().toString(36).substr(2, 9),
          file,
          url,
          width: img.width,
          height: img.height,
          aspect: 'original',
          customW: '1080',
          customH: '1920',
          cropCenter: { x: 0.5, y: 0.5 },
          scale: 1
        });
        loadedCount++;
        if (loadedCount === files.length) {
          setImages(prev => [...prev, ...newImages]);
        }
      };
      img.src = url;
    });
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, []);

  const clearAll = () => {
    images.forEach(img => URL.revokeObjectURL(img.url));
    setImages([]);
    setCurrentIndex(0);
  };

  const handleToggleApplyToAll = () => {
    const newValue = !applyToAll;
    setApplyToAll(newValue);
    if (newValue && images.length > 0) {
      const currentImg = images[currentIndex];
      setImages(prev => prev.map(img => ({
        ...img,
        aspect: currentImg.aspect,
        customW: currentImg.customW,
        customH: currentImg.customH
      })));
    }
  };

  const handleSwapDimensions = () => {
    if (images.length === 0) return;
    const currentImg = images[currentIndex];
    if (currentImg.aspect === 'custom') {
      const newW = currentImg.customH;
      const newH = currentImg.customW;
      updateCurrentImage({ customW: newW, customH: newH });
    }
  };

  const updateCurrentImage = useCallback((updates: Partial<ImageState>) => {
    setImages(prev => {
      const isGlobalUpdate = applyToAll && (updates.aspect !== undefined || updates.customW !== undefined || updates.customH !== undefined);
      
      if (isGlobalUpdate) {
        const globalUpdates = { ...updates };
        delete globalUpdates.scale;
        delete globalUpdates.cropCenter;

        return prev.map((img, i) => {
          if (i === currentIndex) {
            return { ...img, ...updates };
          }
          return { ...img, ...globalUpdates };
        });
      } else {
        return prev.map((img, i) => i === currentIndex ? { ...img, ...updates } : img);
      }
    });
  }, [applyToAll, currentIndex]);

  // Zoom Logic
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (images.length === 0) return;
    const zoomFactor = e.deltaY > 0 ? -0.05 : 0.05;
    const currentImg = images[currentIndex];
    const newScale = Math.max(1, Math.min(10, (currentImg.scale || 1) + zoomFactor));
    updateCurrentImage({ scale: newScale });
  }, [images, currentIndex, updateCurrentImage]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setTouchDist(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && images.length > 0) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const delta = dist - touchDist;
      const zoomFactor = delta > 0 ? 0.05 : -0.05;
      const currentImg = images[currentIndex];
      const newScale = Math.max(1, Math.min(10, (currentImg.scale || 1) + zoomFactor));
      updateCurrentImage({ scale: newScale });
      setTouchDist(dist);
    }
  };

  // Calculate render metrics
  let baseRw = 0, baseRh = 0, baseOx = 0, baseOy = 0;
  let Rw = 0, Rh = 0, Ox = 0, Oy = 0, cw = 0, ch = 0;
  let boxX = 0, boxY = 0;

  const currentImg = images[currentIndex];

  if (currentImg && containerSize.w && containerSize.h) {
    const baseScale = Math.min(containerSize.w / currentImg.width, containerSize.h / currentImg.height) * 0.9;
    const scale = currentImg.scale || 1;
    
    baseRw = currentImg.width * baseScale;
    baseRh = currentImg.height * baseScale;
    baseOx = (containerSize.w - baseRw) / 2;
    baseOy = (containerSize.h - baseRh) / 2;

    Rw = baseRw * scale;
    Rh = baseRh * scale;

    let targetAspect = currentImg.width / currentImg.height;
    if (currentImg.aspect === '1:1') targetAspect = 1;
    else if (currentImg.aspect === '16:9') targetAspect = 16 / 9;
    else if (currentImg.aspect === '4:3') targetAspect = 4 / 3;
    else if (currentImg.aspect === '3:4') targetAspect = 3 / 4;
    else if (currentImg.aspect === '9:16') targetAspect = 9 / 16;
    else if (currentImg.aspect === 'custom' && currentImg.customW && currentImg.customH) {
      targetAspect = Number(currentImg.customW) / Number(currentImg.customH);
    }

    cw = baseRw;
    ch = baseRw / targetAspect;
    if (ch > baseRh) {
      ch = baseRh;
      cw = baseRh * targetAspect;
    }

    const minCx = cw / 2;
    const maxCx = Rw - cw / 2;
    const minCy = ch / 2;
    const maxCy = Rh - ch / 2;

    let cx = currentImg.cropCenter.x * Rw;
    let cy = currentImg.cropCenter.y * Rh;
    cx = Math.max(minCx, Math.min(maxCx, cx));
    cy = Math.max(minCy, Math.min(maxCy, cy));

    // Image position relative to the base wrapper
    Ox = baseRw / 2 - cx;
    Oy = baseRh / 2 - cy;

    // Crop box position relative to the base wrapper
    boxX = (baseRw - cw) / 2;
    boxY = (baseRh - ch) / 2;
  }

  // Dragging logic
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialCropCenter({ ...currentImg.cropCenter });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !currentImg || !containerSize.w) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    const baseScale = Math.min(containerSize.w / currentImg.width, containerSize.h / currentImg.height) * 0.9;
    const scale = currentImg.scale || 1;
    const currentRw = currentImg.width * baseScale * scale;
    const currentRh = currentImg.height * baseScale * scale;

    const baseRw = currentImg.width * baseScale;
    const baseRh = currentImg.height * baseScale;

    let targetAspect = currentImg.width / currentImg.height;
    if (currentImg.aspect === '1:1') targetAspect = 1;
    else if (currentImg.aspect === '16:9') targetAspect = 16 / 9;
    else if (currentImg.aspect === '4:3') targetAspect = 4 / 3;
    else if (currentImg.aspect === '3:4') targetAspect = 3 / 4;
    else if (currentImg.aspect === '9:16') targetAspect = 9 / 16;
    else if (currentImg.aspect === 'custom' && currentImg.customW && currentImg.customH) {
      targetAspect = Number(currentImg.customW) / Number(currentImg.customH);
    }

    let currentCw = baseRw;
    let currentCh = baseRw / targetAspect;
    if (currentCh > baseRh) {
      currentCh = baseRh;
      currentCw = baseRh * targetAspect;
    }

    const minCx = currentCw / 2;
    const maxCx = currentRw - currentCw / 2;
    const minCy = currentCh / 2;
    const maxCy = currentRh - currentCh / 2;

    // dx is positive -> mouse moved right -> image should move right -> cropCenter should move left (decrease)
    let newCx = initialCropCenter.x * currentRw - dx;
    let newCy = initialCropCenter.y * currentRh - dy;

    newCx = Math.max(minCx, Math.min(maxCx, newCx));
    newCy = Math.max(minCy, Math.min(maxCy, newCy));

    updateCurrentImage({
      cropCenter: {
        x: newCx / currentRw,
        y: newCy / currentRh
      }
    });
  }, [isDragging, dragStart, initialCropCenter, currentImg, containerSize, updateCurrentImage]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleExportAll = async () => {
    if (images.length === 0) return;
    setIsExporting(true);

    try {
      const baseFilename = customFilename.trim() || 'image';

      const processImage = (img: ImageState): Promise<Blob | null> => {
        return new Promise((resolve) => {
          const imageElement = new Image();
          imageElement.crossOrigin = "anonymous";
          imageElement.onload = () => {
          // 1. Calculate base scale and dimensions exactly as in render
          const baseScale = Math.min(containerSize.w / img.width, containerSize.h / img.height) * 0.9;
          const scale = img.scale || 1;
          const currentRw = img.width * baseScale * scale;
          const currentRh = img.height * baseScale * scale;
          const baseRw = img.width * baseScale;
          const baseRh = img.height * baseScale;

          // 2. Determine target aspect
          let targetAspect = img.width / img.height;
          if (img.aspect === '1:1') targetAspect = 1;
          else if (img.aspect === '16:9') targetAspect = 16 / 9;
          else if (img.aspect === '4:3') targetAspect = 4 / 3;
          else if (img.aspect === '3:4') targetAspect = 3 / 4;
          else if (img.aspect === '9:16') targetAspect = 9 / 16;
          else if (img.aspect === 'custom' && img.customW && img.customH) {
            targetAspect = Number(img.customW) / Number(img.customH);
          }

          // 3. Calculate crop box size in render coordinates
          let currentCw = baseRw;
          let currentCh = baseRw / targetAspect;
          if (currentCh > baseRh) {
            currentCh = baseRh;
            currentCw = baseRh * targetAspect;
          }

          // 4. Calculate clamped crop center in render coordinates
          const minCx = currentCw / 2;
          const maxCx = currentRw - currentCw / 2;
          const minCy = currentCh / 2;
          const maxCy = currentRh - currentCh / 2;

          let cx = img.cropCenter.x * currentRw;
          let cy = img.cropCenter.y * currentRh;
          cx = Math.max(minCx, Math.min(maxCx, cx));
          cy = Math.max(minCy, Math.min(maxCy, cy));

          // 5. Map crop box back to original image pixel coordinates
          const sourceW = (currentCw / currentRw) * img.width;
          const sourceH = (currentCh / currentRh) * img.height;
          const sourceX = (cx - currentCw / 2) / currentRw * img.width;
          const sourceY = (cy - currentCh / 2) / currentRh * img.height;

          // 6. Determine Exact Pixel Export Size
          let exportCw = Math.round(sourceW);
          let exportCh = Math.round(sourceH);

          if (img.aspect === 'custom' && img.customW && img.customH) {
            exportCw = Number(img.customW);
            exportCh = Number(img.customH);
          }

          // 7. Create Offscreen Canvas and Draw
          const canvas = document.createElement('canvas');
          canvas.width = exportCw;
          canvas.height = exportCh;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);

          // Use high quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          ctx.drawImage(imageElement, sourceX, sourceY, sourceW, sourceH, 0, 0, exportCw, exportCh);

          const mimeType = exportFormat === 'original' ? img.file.type : `image/${exportFormat}`;
          canvas.toBlob((blob) => resolve(blob), mimeType, 1.0);
        };
        imageElement.src = img.url;
      });
    };

    if (images.length === 1) {
      const blob = await processImage(images[0]);
      if (blob) {
        const ext = exportFormat === 'original' ? images[0].file.name.split('.').pop() : exportFormat;
        saveAs(blob, `${baseFilename}.${ext}`);
      }
    } else {
      const zip = new JSZip();
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const blob = await processImage(img);
        if (blob) {
          const ext = exportFormat === 'original' ? img.file.name.split('.').pop() : exportFormat;
          zip.file(`${baseFilename}_${String(i + 1).padStart(2, '0')}.${ext}`, blob);
        }
      }
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${baseFilename}.zip`);
    }
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const aspectRatios = ['original', '1:1', '16:9', '4:3', '3:4', '9:16', 'custom'];

  return (
    <div className="h-screen flex flex-col overflow-hidden selection:bg-black selection:text-white font-sans bg-[#E2E6E7]">
      {/* Header */}
      <header className="w-full border-b border-[#E2E6E7] bg-white flex justify-between items-center px-6 py-4 z-10 relative">
        <div className="font-dot text-base uppercase tracking-widest">ASPECT_ [ ]</div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E2E6E7] flex flex-col z-10">
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
            
            {/* Aspect Ratio */}
            <div className="flex flex-col gap-3 w-full">
              <span className="text-xs uppercase tracking-wider text-black text-left">Aspect Ratio</span>
              <div className="grid grid-cols-2 gap-2 w-full">
                {aspectRatios.map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => updateCurrentImage({ aspect: ratio })}
                    className={`py-2 text-xs uppercase tracking-wider border transition-colors text-center ${
                      currentImg?.aspect === ratio 
                        ? 'border-black bg-black text-white' 
                        : 'border-[#E2E6E7] hover:border-black text-black'
                    }`}
                  >
                    {ratio === 'original' ? 'ORIGINAL' : ratio}
                  </button>
                ))}
              </div>

              {currentImg?.aspect === 'custom' && (
                <div className="flex items-center gap-2 mt-2 w-full">
                  <input 
                    type="number" 
                    value={currentImg.customW}
                    onChange={(e) => updateCurrentImage({ customW: e.target.value })}
                    className="w-full border border-[#E2E6E7] px-2 py-1 text-xs text-center focus:outline-none focus:border-black"
                    placeholder="W"
                  />
                  <button 
                    onClick={handleSwapDimensions}
                    className="flex-shrink-0 p-1 text-[#a0a5a7] hover:text-black transition-colors"
                    title="Swap Dimensions"
                  >
                    <ArrowRightLeft size={14} strokeWidth={1.5} />
                  </button>
                  <input 
                    type="number" 
                    value={currentImg.customH}
                    onChange={(e) => updateCurrentImage({ customH: e.target.value })}
                    className="w-full border border-[#E2E6E7] px-2 py-1 text-xs text-center focus:outline-none focus:border-black"
                    placeholder="H"
                  />
                </div>
              )}

              {/* Apply to All (Checkbox) */}
              <div 
                className="flex items-center justify-between mt-2 w-full cursor-pointer group"
                onClick={handleToggleApplyToAll}
              >
                <span className="font-dot text-[10px] uppercase tracking-widest text-black">APPLY TO ALL</span>
                <div className={`w-4 h-4 border flex items-center justify-center transition-colors ${applyToAll ? 'border-black' : 'border-[#E2E6E7] group-hover:border-black'}`}>
                  {applyToAll && <div className="w-2 h-2 bg-black" />}
                </div>
              </div>
            </div>

            {/* Export Format & Custom Filename */}
            <div className="flex flex-col gap-3 w-full">
              <span className="text-xs uppercase tracking-wider text-black text-left">Export Format</span>
              <select 
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="w-full border border-[#E2E6E7] px-3 py-2 text-xs uppercase tracking-wider focus:outline-none focus:border-black appearance-none bg-transparent rounded-none text-left"
              >
                <option value="original">ORIGINAL</option>
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WEBP</option>
              </select>

              <span className="text-xs uppercase tracking-wider text-black text-left mt-2">Custom Filename</span>
              <input 
                type="text" 
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                placeholder="image"
                className="w-full border border-[#E2E6E7] px-3 py-2 text-xs focus:outline-none focus:border-black bg-transparent text-left"
              />
            </div>

          </div>

          {/* Export Button */}
          <div className="p-6 border-t border-[#E2E6E7]">
            <button 
              onClick={handleExportAll}
              disabled={images.length === 0 || isExporting}
              className="w-full bg-black text-white py-2 text-xs font-dot tracking-widest hover:bg-black/90 disabled:opacity-50 transition-colors"
            >
              {isExporting ? 'EXPORTING...' : (images.length > 1 ? 'EXPORT ALL (ZIP)' : 'EXPORT (SINGLE)')}
            </button>
          </div>
        </aside>

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* CLEAR ALL Button */}
          {images.length > 0 && (
            <button 
              onClick={clearAll}
              className="absolute top-6 right-6 font-dot text-[10px] uppercase tracking-widest text-black bg-transparent border border-black px-3 py-1.5 hover:bg-black/5 transition-colors z-50"
            >
              [ &times; ] CLEAR ALL
            </button>
          )}

          {/* Main Canvas */}
          <main 
            className="flex-1 relative flex flex-col items-center justify-center overflow-hidden bg-[#E2E6E7]"
            style={{
              backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)',
              backgroundSize: '16px 16px'
            }}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            {images.length === 0 ? (
              <div className="w-full h-full p-12 flex items-center justify-center">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-md aspect-square border border-[#E2E6E7] flex flex-col items-center justify-center bg-white/50 cursor-pointer hover:border-black transition-colors"
                >
                  <div className="text-xl mb-3 text-black font-light">+</div>
                  <p className="text-xs uppercase tracking-wider text-black">Drag & Drop images here</p>
                  <p className="text-[10px] uppercase tracking-wider text-black mt-2">or click to browse</p>
                </div>
              </div>
            ) : (
              <>
                <div ref={containerRef} className="absolute inset-12 overflow-hidden flex items-center justify-center">
                {currentImg && containerSize.w > 0 && (
                  <div 
                    className="relative overflow-hidden cursor-move"
                    style={{ width: baseRw, height: baseRh }}
                    onMouseDown={handleMouseDown}
                  >
                    {/* The Image */}
                    <img 
                      src={currentImg.url} 
                      alt="preview" 
                      className="absolute pointer-events-none select-none max-w-none"
                      style={{
                        width: Rw,
                        height: Rh,
                        left: Ox,
                        top: Oy
                      }}
                    />

                    {/* The Glassmorphism Mask (4 divs) */}
                    <div className="absolute inset-0 pointer-events-none z-10">
                      <div className="absolute top-0 left-0 right-0 bg-white/60 backdrop-blur-sm" style={{ height: Math.max(0, boxY) }} />
                      <div className="absolute bottom-0 left-0 right-0 bg-white/60 backdrop-blur-sm" style={{ top: Math.max(0, boxY + ch) }} />
                      <div className="absolute left-0 bg-white/60 backdrop-blur-sm" style={{ top: Math.max(0, boxY), bottom: Math.max(0, baseRh - (boxY + ch)), width: Math.max(0, boxX) }} />
                      <div className="absolute right-0 bg-white/60 backdrop-blur-sm" style={{ top: Math.max(0, boxY), bottom: Math.max(0, baseRh - (boxY + ch)), left: Math.max(0, boxX + cw) }} />
                    </div>

                    {/* The Crop Box */}
                    <div
                      className="absolute border border-black pointer-events-none z-20"
                      style={{ left: boxX, top: boxY, width: cw, height: ch }}
                    >
                      <Cross className="-top-1 -left-1" />
                      <Cross className="-top-1 -right-1" />
                      <Cross className="-bottom-1 -left-1" />
                      <Cross className="-bottom-1 -right-1" />
                    </div>
                  </div>
                )}
              </div>

              {/* Pagination */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white border border-[#E2E6E7] px-4 py-2 z-30">
                <button 
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="text-xs hover:opacity-50 disabled:opacity-30 transition-opacity"
                >
                  [ &lt; ]
                </button>
                <span className="text-xs tracking-widest">
                  {String(currentIndex + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}
                </span>
                <button 
                  onClick={() => setCurrentIndex(prev => Math.min(images.length - 1, prev + 1))}
                  disabled={currentIndex === images.length - 1}
                  className="text-xs hover:opacity-50 disabled:opacity-30 transition-opacity"
                >
                  [ &gt; ]
                </button>
              </div>
            </>
          )}

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files && handleFiles(e.target.files)} 
            className="hidden" 
            multiple 
            accept="image/*"
          />
        </main>
      </div>
      </div>
    </div>
  );
}
