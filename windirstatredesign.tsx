import React, { useState, useEffect, useMemo } from 'react';

interface FileNode {
  name: string;
  size: number;
  type: 'folder' | 'file';
  extension?: string;
  children?: FileNode[];
  path: string;
}

interface TreemapNode extends FileNode {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

const FILE_COLORS: Record<string, string> = {
  folder: 'bg-blue-500',
  js: 'bg-yellow-500',
  ts: 'bg-blue-600',
  tsx: 'bg-blue-700',
  jsx: 'bg-yellow-600',
  json: 'bg-green-500',
  md: 'bg-gray-500',
  css: 'bg-pink-500',
  html: 'bg-orange-500',
  png: 'bg-purple-500',
  jpg: 'bg-purple-600',
  svg: 'bg-indigo-500',
  pdf: 'bg-red-500',
  mp4: 'bg-teal-500',
  mp3: 'bg-cyan-500',
  zip: 'bg-amber-500',
  default: 'bg-gray-400'
};

const mockFileSystem: FileNode = {
  name: 'root',
  type: 'folder',
  size: 0,
  path: '/',
  children: [
    {
      name: 'Documents',
      type: 'folder',
      size: 0,
      path: '/Documents',
      children: [
        { name: 'report.pdf', type: 'file', extension: 'pdf', size: 2500000, path: '/Documents/report.pdf' },
        { name: 'presentation.pptx', type: 'file', extension: 'pptx', size: 8500000, path: '/Documents/presentation.pptx' },
        { name: 'budget.xlsx', type: 'file', extension: 'xlsx', size: 1200000, path: '/Documents/budget.xlsx' },
        {
          name: 'Projects',
          type: 'folder',
          size: 0,
          path: '/Documents/Projects',
          children: [
            { name: 'project1.md', type: 'file', extension: 'md', size: 150000, path: '/Documents/Projects/project1.md' },
            { name: 'project2.md', type: 'file', extension: 'md', size: 280000, path: '/Documents/Projects/project2.md' },
            { name: 'data.json', type: 'file', extension: 'json', size: 3200000, path: '/Documents/Projects/data.json' },
          ]
        }
      ]
    },
    {
      name: 'Code',
      type: 'folder',
      size: 0,
      path: '/Code',
      children: [
        {
          name: 'frontend',
          type: 'folder',
          size: 0,
          path: '/Code/frontend',
          children: [
            { name: 'App.tsx', type: 'file', extension: 'tsx', size: 125000, path: '/Code/frontend/App.tsx' },
            { name: 'index.tsx', type: 'file', extension: 'tsx', size: 45000, path: '/Code/frontend/index.tsx' },
            { name: 'styles.css', type: 'file', extension: 'css', size: 89000, path: '/Code/frontend/styles.css' },
            { name: 'package.json', type: 'file', extension: 'json', size: 12000, path: '/Code/frontend/package.json' },
            { name: 'components.tsx', type: 'file', extension: 'tsx', size: 234000, path: '/Code/frontend/components.tsx' },
            { name: 'utils.ts', type: 'file', extension: 'ts', size: 67000, path: '/Code/frontend/utils.ts' },
          ]
        },
        {
          name: 'backend',
          type: 'folder',
          size: 0,
          path: '/Code/backend',
          children: [
            { name: 'server.js', type: 'file', extension: 'js', size: 178000, path: '/Code/backend/server.js' },
            { name: 'database.js', type: 'file', extension: 'js', size: 256000, path: '/Code/backend/database.js' },
            { name: 'config.json', type: 'file', extension: 'json', size: 8900, path: '/Code/backend/config.json' },
            { name: 'routes.js', type: 'file', extension: 'js', size: 145000, path: '/Code/backend/routes.js' },
          ]
        }
      ]
    },
    {
      name: 'Media',
      type: 'folder',
      size: 0,
      path: '/Media',
      children: [
        {
          name: 'Images',
          type: 'folder',
          size: 0,
          path: '/Media/Images',
          children: [
            { name: 'photo1.jpg', type: 'file', extension: 'jpg', size: 4500000, path: '/Media/Images/photo1.jpg' },
            { name: 'photo2.jpg', type: 'file', extension: 'jpg', size: 3800000, path: '/Media/Images/photo2.jpg' },
            { name: 'screenshot.png', type: 'file', extension: 'png', size: 2100000, path: '/Media/Images/screenshot.png' },
            { name: 'logo.svg', type: 'file', extension: 'svg', size: 45000, path: '/Media/Images/logo.svg' },
            { name: 'banner.png', type: 'file', extension: 'png', size: 5600000, path: '/Media/Images/banner.png' },
          ]
        },
        {
          name: 'Videos',
          type: 'folder',
          size: 0,
          path: '/Media/Videos',
          children: [
            { name: 'tutorial.mp4', type: 'file', extension: 'mp4', size: 125000000, path: '/Media/Videos/tutorial.mp4' },
            { name: 'demo.mp4', type: 'file', extension: 'mp4', size: 89000000, path: '/Media/Videos/demo.mp4' },
            { name: 'presentation.mp4', type: 'file', extension: 'mp4', size: 234000000, path: '/Media/Videos/presentation.mp4' },
          ]
        },
        {
          name: 'Audio',
          type: 'folder',
          size: 0,
          path: '/Media/Audio',
          children: [
            { name: 'podcast.mp3', type: 'file', extension: 'mp3', size: 45000000, path: '/Media/Audio/podcast.mp3' },
            { name: 'music.mp3', type: 'file', extension: 'mp3', size: 8900000, path: '/Media/Audio/music.mp3' },
          ]
        }
      ]
    },
    {
      name: 'Downloads',
      type: 'folder',
      size: 0,
      path: '/Downloads',
      children: [
        { name: 'installer.exe', type: 'file', extension: 'exe', size: 156000000, path: '/Downloads/installer.exe' },
        { name: 'archive.zip', type: 'file', extension: 'zip', size: 78000000, path: '/Downloads/archive.zip' },
        { name: 'document.pdf', type: 'file', extension: 'pdf', size: 4500000, path: '/Downloads/document.pdf' },
        { name: 'image.jpg', type: 'file', extension: 'jpg', size: 2300000, path: '/Downloads/image.jpg' },
      ]
    }
  ]
};

function calculateNodeSize(node: FileNode): number {
  if (node.type === 'file') {
    return node.size;
  }
  let totalSize = 0;
  node.children?.forEach(child => {
    totalSize += calculateNodeSize(child);
  });
  node.size = totalSize;
  return totalSize;
}

function createTreemap(node: FileNode, x: number, y: number, width: number, height: number, depth: number = 0): TreemapNode[] {
  const result: TreemapNode[] = [];
  
  const treeNode: TreemapNode = {
    ...node,
    x,
    y,
    width,
    height,
    depth
  };
  
  result.push(treeNode);
  
  if (node.children && node.children.length > 0) {
    const sortedChildren = [...node.children].sort((a, b) => b.size - a.size);
    let currentX = x;
    let currentY = y;
    let remainingWidth = width;
    let remainingHeight = height;
    
    const totalSize = sortedChildren.reduce((sum, child) => sum + child.size, 0);
    
    sortedChildren.forEach((child, index) => {
      const ratio = child.size / totalSize;
      
      if (remainingWidth > remainingHeight) {
        const childWidth = remainingWidth * ratio;
        const childNodes = createTreemap(child, currentX, currentY, childWidth, remainingHeight, depth + 1);
        result.push(...childNodes);
        currentX += childWidth;
        remainingWidth -= childWidth;
      } else {
        const childHeight = remainingHeight * ratio;
        const childNodes = createTreemap(child, currentX, currentY, remainingWidth, childHeight, depth + 1);
        result.push(...childNodes);
        currentY += childHeight;
        remainingHeight -= childHeight;
      }
    });
  }
  
  return result;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function getNodeColor(node: TreemapNode): string {
  if (node.type === 'folder') return FILE_COLORS.folder;
  return FILE_COLORS[node.extension || ''] || FILE_COLORS.default;
}

export default function DiskSpaceVisualizer() {
  const [currentRoot, setCurrentRoot] = useState<FileNode>(mockFileSystem);
  const [hoveredNode, setHoveredNode] = useState<TreemapNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreemapNode | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterExtension, setFilterExtension] = useState<string>('all');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>(['root']);
  
  useEffect(() => {
    calculateNodeSize(mockFileSystem);
  }, []);
  
  const treemapNodes = useMemo(() => {
    const rootCopy = { ...currentRoot };
    calculateNodeSize(rootCopy);
    return createTreemap(rootCopy, 0, 0, 800, 600, 0);
  }, [currentRoot]);
  
  const filteredNodes = useMemo(() => {
    return treemapNodes.filter(node => {
      const matchesSearch = searchTerm === '' || node.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterExtension === 'all' || 
        (filterExtension === 'folders' && node.type === 'folder') ||
        (node.extension === filterExtension);
      return matchesSearch && matchesFilter;
    });
  }, [treemapNodes, searchTerm, filterExtension]);
  
  const extensions = useMemo(() => {
    const exts = new Set<string>();
    treemapNodes.forEach(node => {
      if (node.extension) exts.add(node.extension);
    });
    return Array.from(exts).sort();
  }, [treemapNodes]);
  
  const totalSize = useMemo(() => {
    return calculateNodeSize({ ...currentRoot });
  }, [currentRoot]);
  
  const handleNodeClick = (node: TreemapNode) => {
    if (node.type === 'folder' && node.children && node.children.length > 0) {
      setCurrentRoot(node);
      setBreadcrumbs([...breadcrumbs, node.name]);
      setSelectedNode(null);
    } else {
      setSelectedNode(node);
    }
  };
  
  const navigateToBreadcrumb = (index: number) => {
    if (index === 0) {
      setCurrentRoot(mockFileSystem);
      setBreadcrumbs(['root']);
    } else {
      const path = breadcrumbs.slice(0, index + 1).join('/');
      let node = mockFileSystem;
      for (let i = 1; i <= index; i++) {
        node = node.children?.find(child => child.name === breadcrumbs[i]) as FileNode || node;
      }
      setCurrentRoot(node);
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    }
    setSelectedNode(null);
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
          Disk Space Visualizer
        </h1>
        
        <div className="flex gap-6">
          <div className="flex-1">
            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-4 mb-4">
                <input
                  type="text"
                  placeholder="Search files and folders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={filterExtension}
                  onChange={(e) => setFilterExtension(e.target.value)}
                  className="px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="folders">Folders Only</option>
                  {extensions.map(ext => (
                    <option key={ext} value={ext}>.{ext}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="text-gray-500">/</span>}
                    <button
                      onClick={() => navigateToBreadcrumb(index)}
                      className="hover:text-blue-400 transition-colors"
                    >
                      {crumb}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 relative overflow-hidden">
              <svg width="800" height="600" className="w-full h-auto">
                {filteredNodes.map((node) => {
                  const isHovered = hoveredNode === node;
                  const isSelected = selectedNode === node;
                  const opacity = searchTerm || filterExtension !== 'all' ? 
                    (filteredNodes.includes(node) ? 1 : 0.2) : 1;
                  
                  return (
                    <g key={node.path}>
                      <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        className={`${getNodeColor(node)} cursor-pointer transition-all duration-200`}
                        fillOpacity={opacity * (isHovered ? 0.9 : 0.7)}
                        stroke={isSelected ? '#60a5fa' : '#1f2937'}
                        strokeWidth={isSelected ? 3 : 1}
                        onClick={() => handleNodeClick(node)}
                        onMouseEnter={() => setHoveredNode(node)}
                        onMouseLeave={() => setHoveredNode(null)}
                      />
                      {node.width > 50 && node.height > 30 && (
                        <text
                          x={node.x + node.width / 2}
                          y={node.y + node.height / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="pointer-events-none select-none"
                          fill="white"
                          fontSize={Math.min(node.width / 10, node.height / 4, 14)}
                        >
                          {node.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
          
          <div className="w-80">
            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-semibold mb-4">Statistics</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Size:</span>
                  <span className="font-mono">{formatBytes(totalSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Items:</span>
                  <span className="font-mono">{treemapNodes.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Folders:</span>
                  <span className="font-mono">{treemapNodes.filter(n => n.type === 'folder').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Files:</span>
                  <span className="font-mono">{treemapNodes.filter(n => n.type === 'file').length}</span>
                </div>
              </div>
            </div>
            
            {(hoveredNode || selectedNode) && (
              <div className="bg-gray-800 rounded-lg p-4 mb-4">
                <h3 className="text-lg font-semibold mb-4">Item Details</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-400">Name:</span>
                    <p className="font-mono break-all">{(hoveredNode || selectedNode)?.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Type:</span>
                    <p className="font-mono">{(hoveredNode || selectedNode)?.type}</p>
                  </div>
                  {(hoveredNode || selectedNode)?.extension && (
                    <div>
                      <span className="text-gray-400">Extension:</span>
                      <p className="font-mono">.{(hoveredNode || selectedNode)?.extension}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400">Size:</span>
                    <p className="font-mono">{formatBytes((hoveredNode || selectedNode)?.size || 0)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Path:</span>
                    <p className="font-mono text-xs break-all">{(hoveredNode || selectedNode)?.path}</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">File Type Legend</h3>
              <div className="space-y-2">
                {Object.entries(FILE_COLORS).slice(0, 10).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className={`w-4 h-4 ${color} rounded`}></div>
                    <span className="text-sm capitalize">
                      {type === 'default' ? 'Other' : type === 'folder' ? 'Folder' : `.${type}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
