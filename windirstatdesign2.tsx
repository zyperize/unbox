import React, { useState, useMemo } from 'react';

interface FileItem {
  name: string;
  size: number;
  type: 'document' | 'image' | 'video' | 'code' | 'archive' | 'system' | 'other';
  path: string;
}

interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  item: FileItem;
}

const generateMockData = (): FileItem[] => {
  return [
    { name: 'Project_Report.pdf', size: 2400000, type: 'document', path: '/Documents' },
    { name: 'Budget_2024.xlsx', size: 850000, type: 'document', path: '/Documents' },
    { name: 'Meeting_Notes.docx', size: 450000, type: 'document', path: '/Documents' },
    { name: 'Quarterly_Review.pptx', size: 1200000, type: 'document', path: '/Documents' },
    
    { name: 'vacation_photo.jpg', size: 3200000, type: 'image', path: '/Pictures' },
    { name: 'screenshot_001.png', size: 1800000, type: 'image', path: '/Pictures' },
    { name: 'design_mockup.psd', size: 4500000, type: 'image', path: '/Pictures' },
    { name: 'logo_final.svg', size: 120000, type: 'image', path: '/Pictures' },
    { name: 'photo_album.jpg', size: 2800000, type: 'image', path: '/Pictures' },
    
    { name: 'presentation.mp4', size: 15000000, type: 'video', path: '/Videos' },
    { name: 'tutorial_edit.mov', size: 8500000, type: 'video', path: '/Videos' },
    { name: 'demo_recording.avi', size: 6200000, type: 'video', path: '/Videos' },
    
    { name: 'main.tsx', size: 45000, type: 'code', path: '/Projects/app' },
    { name: 'utils.ts', size: 28000, type: 'code', path: '/Projects/app' },
    { name: 'styles.css', size: 32000, type: 'code', path: '/Projects/app' },
    { name: 'package.json', size: 12000, type: 'code', path: '/Projects/app' },
    { name: 'config.js', size: 18000, type: 'code', path: '/Projects/app' },
    
    { name: 'backup_2024.zip', size: 12000000, type: 'archive', path: '/Backups' },
    { name: 'old_files.tar.gz', size: 6800000, type: 'archive', path: '/Backups' },
    { name: 'archive_2023.rar', size: 4200000, type: 'archive', path: '/Backups' },
    
    { name: 'system.log', size: 1200000, type: 'system', path: '/System' },
    { name: 'cache_data', size: 2800000, type: 'system', path: '/System' },
    { name: 'temp_files', size: 1500000, type: 'system', path: '/System' },
    { name: 'error.log', size: 800000, type: 'system', path: '/System' },
    
    { name: 'database.db', size: 5600000, type: 'other', path: '/Data' },
    { name: 'config.ini', size: 8000, type: 'other', path: '/Config' },
    { name: 'settings.dat', size: 150000, type: 'other', path: '/Config' },
  ];
};

const Home: React.FC = () => {
  const [hoveredItem, setHoveredItem] = useState<FileItem | null>(null);
  const data = useMemo(() => generateMockData(), []);
  
  const totalSize = useMemo(() => {
    return data.reduce((sum, item) => sum + item.size, 0);
  }, [data]);
  
  const fileTypeStats = useMemo(() => {
    const stats: Record<string, { size: number; count: number; color: string; label: string }> = {
      document: { size: 0, count: 0, color: 'bg-amber-400', label: 'Documents' },
      image: { size: 0, count: 0, color: 'bg-orange-500', label: 'Images' },
      video: { size: 0, count: 0, color: 'bg-red-500', label: 'Videos' },
      code: { size: 0, count: 0, color: 'bg-yellow-400', label: 'Code' },
      archive: { size: 0, count: 0, color: 'bg-orange-600', label: 'Archives' },
      system: { size: 0, count: 0, color: 'bg-stone-500', label: 'System' },
      other: { size: 0, count: 0, color: 'bg-stone-300', label: 'Other' },
    };
    
    data.forEach(item => {
      stats[item.type].size += item.size;
      stats[item.type].count += 1;
    });
    
    return stats;
  }, [data]);
  
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
  };
  
  const getColorForType = (type: string): string => {
    return fileTypeStats[type]?.color || 'bg-stone-300';
  };
  
  const calculateTreemap = (
    items: FileItem[],
    x: number,
    y: number,
    width: number,
    height: number
  ): TreemapRect[] => {
    if (items.length === 0) return [];
    
    const rects: TreemapRect[] = [];
    const sortedItems = [...items].sort((a, b) => b.size - a.size);
    
    const total = sortedItems.reduce((sum, item) => sum + item.size, 0);
    
    let remaining = [...sortedItems];
    let currentX = x;
    let currentY = y;
    let remainingWidth = width;
    let remainingHeight = height;
    
    while (remaining.length > 0) {
      const horizontal = remainingWidth >= remainingHeight;
      const item = remaining.shift()!;
      const ratio = item.size / total;
      const area = ratio * (width * height);
      
      let itemWidth: number;
      let itemHeight: number;
      
      if (horizontal) {
        itemHeight = remainingHeight;
        itemWidth = Math.min(area / itemHeight, remainingWidth);
      } else {
        itemWidth = remainingWidth;
        itemHeight = Math.min(area / itemWidth, remainingHeight);
      }
      
      rects.push({
        x: currentX,
        y: currentY,
        width: Math.max(itemWidth, 1),
        height: Math.max(itemHeight, 1),
        item,
      });
      
      if (horizontal) {
        currentX += itemWidth;
        remainingWidth -= itemWidth;
      } else {
        currentY += itemHeight;
        remainingHeight -= itemHeight;
      }
      
      if (remainingWidth < 1) {
        currentX = x;
        remainingWidth = width;
      }
      if (remainingHeight < 1) {
        currentY = y;
        remainingHeight = height;
      }
    }
    
    return rects;
  };
  
  const treemapRects = useMemo(() => {
    return calculateTreemap(data, 0, 0, 100, 100);
  }, [data, totalSize]);
  
  return (
    <div className="min-h-screen bg-orange-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-amber-100 border-4 border-black shadow-lg">
          <div className="p-6">
            <h1 className="text-5xl font-black text-black mb-2 tracking-tight">DISKMAP</h1>
            <p className="text-lg text-stone-700 font-bold">Next-Gen Disk Space Visualization</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border-4 border-black shadow-lg">
            <div className="p-6">
              <div className="text-sm font-black text-stone-500 mb-2 tracking-wide">TOTAL SIZE</div>
              <div className="text-3xl font-black text-black">{formatBytes(totalSize)}</div>
            </div>
          </div>
          <div className="bg-white border-4 border-black shadow-lg">
            <div className="p-6">
              <div className="text-sm font-black text-stone-500 mb-2 tracking-wide">TOTAL FILES</div>
              <div className="text-3xl font-black text-black">{data.length}</div>
            </div>
          </div>
          <div className="bg-white border-4 border-black shadow-lg">
            <div className="p-6">
              <div className="text-sm font-black text-stone-500 mb-2 tracking-wide">LARGEST FILE</div>
              <div className="text-3xl font-black text-black">
                {formatBytes(Math.max(...data.map(f => f.size)))}
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white border-4 border-black shadow-lg">
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-3xl font-black text-black mb-2">VISUAL MAP</h2>
              <p className="text-sm text-stone-600 font-bold">Hover blocks for file information</p>
            </div>
            
            <div className="relative w-full bg-stone-50 border-4 border-black overflow-hidden" style={{ height: '500px' }}>
              {treemapRects.map((rect, index) => {
                const isHovered = hoveredItem?.name === rect.item.name;
                const canShowText = rect.width > 6 && rect.height > 6;
                
                return (
                  <div
                    key={`${rect.item.name}-${index}`}
                    className={`absolute border-2 border-black transition-all duration-300 cursor-pointer ${getColorForType(rect.item.type)} ${
                      isHovered ? 'z-20 brightness-110' : 'hover:brightness-110 hover:z-10'
                    }`}
                    style={{
                      left: `${rect.x}%`,
                      top: `${rect.y}%`,
                      width: `${rect.width}%`,
                      height: `${rect.height}%`,
                      transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                    }}
                    onMouseEnter={() => setHoveredItem(rect.item)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    {canShowText && (
                      <div className="p-2 h-full flex flex-col justify-between overflow-hidden">
                        <div className="text-xs font-black text-black truncate leading-tight">
                          {rect.item.name}
                        </div>
                        {rect.width > 10 && rect.height > 10 && (
                          <div className="text-xs font-bold text-black opacity-75">
                            {formatBytes(rect.item.size)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {hoveredItem && (
          <div className="bg-orange-200 border-4 border-black shadow-lg">
            <div className="p-6">
              <h3 className="text-2xl font-black text-black mb-4 tracking-tight">FILE DETAILS</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-xs font-black text-stone-600 mb-1 tracking-wide">FILE NAME</div>
                  <div className="text-xl font-black text-black break-all">{hoveredItem.name}</div>
                </div>
                <div>
                  <div className="text-xs font-black text-stone-600 mb-1 tracking-wide">FILE SIZE</div>
                  <div className="text-xl font-black text-black">{formatBytes(hoveredItem.size)}</div>
                </div>
                <div>
                  <div className="text-xs font-black text-stone-600 mb-1 tracking-wide">FILE TYPE</div>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 border-2 border-black ${getColorForType(hoveredItem.type)}`}></div>
                    <div className="text-xl font-black text-black uppercase">{hoveredItem.type}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-black text-stone-600 mb-1 tracking-wide">LOCATION</div>
                  <div className="text-xl font-black text-black">{hoveredItem.path}</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t-2 border-black">
                <div className="text-xs font-black text-stone-600 mb-2 tracking-wide">SIZE PERCENTAGE</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-stone-100 border-2 border-black h-8 overflow-hidden">
                    <div className={`h-full ${getColorForType(hoveredItem.type)} border-r-2 border-black transition-all duration-300`} style={{ width: `${(hoveredItem.size / totalSize) * 100}%` }}></div>
                  </div>
                  <div className="text-xl font-black text-black">
                    {((hoveredItem.size / totalSize) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-amber-100 border-4 border-black shadow-lg">
          <div className="p-6">
            <h3 className="text-2xl font-black text-black mb-6 tracking-tight">FILE TYPES LEGEND</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(fileTypeStats)
                .filter(([_, stats]) => stats.count > 0)
                .map(([type, stats]) => (
                  <div key={type} className="bg-white border-2 border-black shadow-md">
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-8 h-8 border-2 border-black ${stats.color}`}></div>
                        <span className="text-base font-black text-black uppercase">{stats.label}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-stone-600">
                          {stats.count} {stats.count === 1 ? 'file' : 'files'}
                        </div>
                        <div className="text-sm font-black text-black">
                          {formatBytes(stats.size)}
                        </div>
                        <div className="text-xs font-bold text-orange-600">
                          {((stats.size / totalSize) * 100).toFixed(1)}% of total
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
