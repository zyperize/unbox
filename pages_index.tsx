import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cpu, HardDrive, Package, Archive, BarChart2, Settings, 
  Minimize2, X, Maximize2, ArrowLeft, RefreshCw, 
  Thermometer, Zap, Activity, Folder, File, FileArchive, 
  Download, Upload, Search, MoreVertical, ChevronRight, ChevronDown
} from 'lucide-react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for Neobrutalist class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- DESIGN SYSTEM CONSTANTS ---
const COLORS = {
  bg: 'bg-[#F3EDDF]',      // Warm Beige Base
  surface: 'bg-[#F7F1E2]',
  primary: 'bg-[#D97A2B]', // Warm Orange Accent
  secondary: 'bg-[#E7A56E]', // Muted highlight
  neutral: 'bg-[#E9E1CF]',   // Soft surface neutral
  text: 'text-neutral-900',
  border: 'border-neutral-900',
};

const NEO_SHADOW = 'shadow-[4px_4px_0px_0px_rgba(23,23,23,1)]';
const NEO_SHADOW_SM = 'shadow-[2px_2px_0px_0px_rgba(23,23,23,1)]';
const NEO_BORDER = 'border-2 border-neutral-900';

// --- SHARED COMPONENTS ---

const NeoButton = ({ children, className, variant = 'default', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'icon' }) => (
  <button 
    className={cn(
      NEO_BORDER, 'font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      variant === 'primary' ? `${COLORS.primary} ${COLORS.text} ${NEO_SHADOW} px-6 py-3` : 
      variant === 'icon' ? `${COLORS.surface} p-2 ${NEO_SHADOW_SM} hover:-translate-y-0.5 hover:translate-x-[-0.5px]` : 
      `${COLORS.surface} ${COLORS.text} ${NEO_SHADOW} px-4 py-2 hover:bg-orange-50`,
      className
    )}
    {...props}
  >
    {children}
  </button>
);

const NeoCard = ({ children, className, noShadow = false }: { children: React.ReactNode, className?: string, noShadow?: boolean }) => (
  <div className={cn(
    COLORS.surface, NEO_BORDER, 'p-4',
    !noShadow && NEO_SHADOW,
    className
  )}>
    {children}
  </div>
);

const WindowFrame = ({ title, icon: Icon, onClose, onBack, children }: { title: string, icon: any, onClose?: () => void, onBack?: () => void, children: React.ReactNode }) => (
  <div className={cn(
    'h-full w-full flex flex-col overflow-hidden',
    COLORS.bg
  )}>
    {/* Title Bar */}
    <div className={cn(
      'flex items-center justify-between px-4 py-3',
      NEO_BORDER, 'border-b-2 bg-white z-10'
    )}>
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="hover:bg-neutral-200 p-1 rounded">
            <ArrowLeft size={20} className="stroke-[3]" />
          </button>
        )}
        <Icon size={24} className="stroke-[2.5] text-orange-600" />
        <h1 className="text-xl font-black tracking-tight uppercase">{title}</h1>
      </div>
      <div className="flex gap-2">
        <button className="p-2 hover:bg-neutral-200 border-2 border-transparent hover:border-neutral-900"><Minimize2 size={18} /></button>
        <button className="p-2 hover:bg-neutral-200 border-2 border-transparent hover:border-neutral-900"><Maximize2 size={18} /></button>
        <button onClick={onClose} className="p-2 hover:bg-red-500 hover:text-white border-2 border-transparent hover:border-neutral-900 transition-colors"><X size={18} className="stroke-[3]" /></button>
      </div>
    </div>
    {/* Content */}
    <div className="flex-1 overflow-auto">
      {children}
    </div>
  </div>
);

// --- SPECS APP ---

const MOCK_CPU_DATA = { name: 'AMD Ryzen 9 7950X', cores: 16, threads: 32, socket: 'AM5', lithography: '5nm' };
const MOCK_GPU_DATA = { name: 'NVIDIA GeForce RTX 4090', vram: '24 GB GDDR6X', driver: '536.99', clock: '2520 MHz' };

const SpecsApp = ({ onClose }: { onClose: () => void }) => {
  const [tick, setTick] = useState(0);

  // Simulate live data
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const cpuTemp = useMemo(() => 45 + Math.random() * 15, [tick]);
  const cpuLoad = useMemo(() => 10 + Math.random() * 30, [tick]);
  const gpuTemp = useMemo(() => 35 + Math.random() * 10, [tick]);
  const ramUsage = useMemo(() => 16.4 + Math.random() * 0.5, [tick]);

  const StatBar = ({ label, value, max, unit, color = COLORS.primary }: any) => (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm font-mono font-bold">
        <span>{label}</span>
        <span>{value.toFixed(1)}{unit}</span>
      </div>
      <div className={cn(NEO_BORDER, 'h-6 p-[2px] bg-white')}>
        <div 
          className={cn('h-full transition-all duration-500 ease-out', color)}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );

  return (
    <WindowFrame title="Specs" icon={Cpu} onClose={onClose} onBack={onClose}>
      <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-neutral-100 min-h-full">
        {/* CPU Card */}
        <NeoCard className="md:col-span-8 flex flex-col gap-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 border-2 border-neutral-900"><Cpu size={32} className="text-orange-600" /></div>
              <div>
                <h2 className="text-2xl font-black">{MOCK_CPU_DATA.name}</h2>
                <p className="font-mono text-sm opacity-70">{MOCK_CPU_DATA.cores} Cores / {MOCK_CPU_DATA.threads} Threads</p>
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-3xl font-bold">{(4.5 + Math.random() * 0.5).toFixed(2)} GHz</div>
              <div className="text-sm font-bold text-orange-600">CORE #0</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <StatBar label="LOAD" value={cpuLoad} max={100} unit="%" />
            <StatBar label="TEMP" value={cpuTemp} max={95} unit="°C" color="bg-red-500" />
          </div>
          <div className="grid grid-cols-4 gap-4 pt-4 border-t-2 border-neutral-900 font-mono text-sm">
             <div>
                <div className="opacity-60 font-bold">SOCKET</div>
                <div>{MOCK_CPU_DATA.socket}</div>
             </div>
             <div>
                <div className="opacity-60 font-bold">LITHOGRAPHY</div>
                <div>{MOCK_CPU_DATA.lithography}</div>
             </div>
             <div>
                <div className="opacity-60 font-bold">TDP</div>
                <div>170W</div>
             </div>
             <div>
                <div className="opacity-60 font-bold">VOLTAGE</div>
                <div>{(1.1 + Math.random() * 0.1).toFixed(3)}V</div>
             </div>
          </div>
        </NeoCard>

        {/* RAM Card */}
        <NeoCard className="md:col-span-4 flex flex-col justify-between">
           <div>
              <div className="flex items-center gap-2 mb-4">
                <Activity className="text-orange-600" />
                <h3 className="font-black text-lg">MEMORY</h3>
              </div>
              <div className="text-4xl font-black mb-2 font-mono">
                {ramUsage.toFixed(1)} <span className="text-lg opacity-60">/ 32 GB</span>
              </div>
              <StatBar label="USAGE" value={ramUsage} max={32} unit="GB" color="bg-blue-400" />
           </div>
           <div className="font-mono text-sm mt-6 space-y-1">
             <div className="flex justify-between"><span>TYPE</span><span className="font-bold">DDR5</span></div>
             <div className="flex justify-between"><span>SPEED</span><span className="font-bold">6000 MT/s</span></div>
             <div className="flex justify-between"><span>CHANNELS</span><span className="font-bold">DUAL</span></div>
           </div>
        </NeoCard>

        {/* GPU Card */}
        <NeoCard className="md:col-span-6">
           <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-green-100 border-2 border-neutral-900"><Zap size={24} className="text-green-700" /></div>
              <div>
                <h3 className="text-xl font-black leading-none">{MOCK_GPU_DATA.name}</h3>
                <p className="font-mono text-xs opacity-70">{MOCK_GPU_DATA.vram}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <StatBar label="CORE LOAD" value={Math.random() * 5} max={100} unit="%" color="bg-green-400" />
              <StatBar label="TEMP" value={gpuTemp} max={95} unit="°C" color="bg-orange-400" />
            </div>
        </NeoCard>

        {/* Storage Summary Card */}
        <NeoCard className="md:col-span-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
                <HardDrive className="text-neutral-600" />
                <h3 className="font-black text-lg">STORAGE</h3>
            </div>
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold bg-neutral-200 px-2 py-1 border-2 border-neutral-900">C:\\</span>
                <div className="flex-1">
                  <StatBar label="NVMe SSD 2TB" value={1.2} max={2} unit="TB" color={COLORS.neutral} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold bg-neutral-200 px-2 py-1 border-2 border-neutral-900">D:\\</span>
                <div className="flex-1">
                  <StatBar label="SATA SSD 4TB" value={3.1} max={4} unit="TB" color={COLORS.neutral} />
                </div>
              </div>
            </div>
        </NeoCard>

      </div>
    </WindowFrame>
  );
};

// --- UNBOX APP ---

type FileItem = { name: string, type: 'folder' | 'archive' | 'file', size?: string, date: string };
const MOCK_FILES: FileItem[] = [
  { name: 'Project_Titan_Assets', type: 'folder', date: '2023-10-27 14:22' },
  { name: 'Client_Deliverables_FINAL.zip', type: 'archive', size: '1.2 GB', date: '2023-10-26 09:15' },
  { name: 'backup_photos_2023.7z', type: 'archive', size: '4.8 GB', date: '2023-09-01 18:30' },
  { name: 'contract_draft_v2.pdf', type: 'file', size: '2.4 MB', date: '2023-10-28 11:05' },
  { name: 'setup_log.txt', type: 'file', size: '12 KB', date: '2023-10-29 08:00' },
];

const UnboxApp = ({ onClose }: { onClose: () => void }) => {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <WindowFrame title="Unbox" icon={Package} onClose={onClose} onBack={onClose}>
      <div className="flex flex-col h-full bg-neutral-100">
        {/* Toolbar */}
        <div className={cn('flex gap-2 p-3 bg-white border-b-2 border-neutral-900')}>
           <NeoButton variant="icon" title="Extract"><Upload size={18} /></NeoButton>
           <NeoButton variant="icon" title="Compress"><Download size={18} /></NeoButton>
           <div className="w-[2px] bg-neutral-900 mx-2" />
           <NeoButton variant="icon"><RefreshCw size={18} /></NeoButton>
           <div className="flex-1"></div>
           <div className={cn("relative flex items-center", NEO_BORDER, "bg-white px-2 shadow-sm")}>
             <Search size={16} className="opacity-50 mr-2" />
             <input className="bg-transparent outline-none font-mono text-sm py-1" placeholder="Filter files..." />
           </div>
        </div>

        {/* Address Bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b-2 border-neutral-900 font-mono text-sm">
           <HardDrive size={14} />
           <span>C:\\</span>
           <ChevronRight size={14} className="opacity-50" />
           <span>Users</span>
           <ChevronRight size={14} className="opacity-50" />
           <span className="font-bold">Downloads</span>
        </div>

        {/* File List */}
        <div className="flex-1 p-4 overflow-y-auto">
          <NeoCard noShadow className="min-h-full bg-white p-0 flex flex-col">
             {/* Table Header */}
             <div className="grid grid-cols-12 gap-4 p-3 border-b-2 border-neutral-900 bg-neutral-100 font-bold text-xs tracking-wider text-neutral-600">
               <div className="col-span-6">NAME</div>
               <div className="col-span-2 text-right">SIZE</div>
               <div className="col-span-4 text-right">DATE MODIFIED</div>
             </div>
             {/* Table Body */}
             <div className="flex-1">
               {MOCK_FILES.map((file, i) => (
                 <div 
                    key={file.name} 
                    onClick={() => setSelected(file.name)}
                    className={cn(
                      "grid grid-cols-12 gap-4 p-3 border-b border-neutral-200 cursor-default select-none group font-mono text-sm items-center",
                      selected === file.name ? "bg-orange-100" : "hover:bg-neutral-50"
                    )}
                 >
                    <div className="col-span-6 flex items-center gap-3 overflow-hidden">
                      {file.type === 'folder' ? <Folder className="text-orange-500 fill-orange-100" size={20} /> :
                       file.type === 'archive' ? <FileArchive className="text-purple-600" size={20} /> :
                       <File className="text-neutral-500" size={20} />}
                      <span className="truncate font-semibold text-neutral-900">{file.name}</span>
                    </div>
                    <div className="col-span-2 text-right opacity-70">{file.size || '--'}</div>
                    <div className="col-span-4 text-right opacity-70">{file.date}</div>
                 </div>
               ))}

               {/* Drop Zone Filler */}
               <div className="flex-1 min-h-[200px] flex items-center justify-center border-2 border-dashed border-neutral-300 m-4 rounded-lg bg-neutral-50">
                  <div className="text-center opacity-40 flex flex-col items-center">
                    <Download size={48} className="mb-2" />
                    <p className="font-bold font-sans">DROP FILES HERE</p>
                    <p className="text-sm font-mono">to compress or extract</p>
                  </div>
               </div>
             </div>
          </NeoCard>
        </div>

        {/* Status Bar */}
        <div className="px-4 py-1 bg-neutral-900 text-orange-50 text-xs font-mono flex justify-between">
          <span>{MOCK_FILES.length} items</span>
          <span>{selected ? '1 item selected' : 'Ready'}</span>
        </div>
      </div>
    </WindowFrame>
  );
};

// --- SPACE APP ---

const SPACE_DATA = [
  { name: 'C:', children: [
    { name: 'Windows', size: 25000, color: '#ef4444' }, // red
    { name: 'Program Files', size: 45000, color: '#f97316' }, // orange
    { name: 'Users', children: [
      { name: 'Documents', size: 12000, color: '#eab308' }, // yellow
      { name: 'Downloads', size: 35000, color: '#84cc16' }, // lime
      { name: 'Desktop', size: 5000, color: '#22c55e' }, // green
      { name: 'AppData', size: 18000, color: '#06b6d4' }, // cyan
    ]},
    { name: 'Games', children: [
      { name: 'Steam', size: 120000, color: '#3b82f6' }, // blue
      { name: 'Epic', size: 80000, color: '#6366f1' }, // indigo
    ]},
    { name: 'Pagefile.sys', size: 16000, color: '#a855f7' }, // purple
    { name: 'Hiberfil.sys', size: 12000, color: '#d946ef' }, // fuchsia
  ]}
];

const CustomTreemapContent = (props: any) => {
  const { root, depth, x, y, width, height, index, name, color } = props;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: color || COLORS.neutral,
          stroke: '#171717',
          strokeWidth: 2 / (depth + 1e-10),
          opacity: 1,
        }}
      />
      {width > 50 && height > 30 && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          fill="#171717"
          fontSize={Math.min(width / 5, 14)}
          fontWeight="bold"
          className="font-mono pointer-events-none"
        >
          {name}
        </text>
      )}
    </g>
  );
};

const SpaceApp = ({ onClose }: { onClose: () => void }) => {
  return (
    <WindowFrame title="Space" icon={HardDrive} onClose={onClose} onBack={onClose}>
      <div className="flex flex-col h-full bg-neutral-100">
        <div className="flex p-4 gap-4 border-b-2 border-neutral-900 bg-white items-center">
          <div className={cn("relative flex items-center w-64", NEO_BORDER, "bg-white px-3 py-2 NEO_SHADOW_SM")}>
             <HardDrive size={18} className="mr-2" />
             <select className="bg-transparent outline-none font-bold flex-1 appearance-none">
               <option>Local Disk (C:)</option>
               <option>Data (D:)</option>
             </select>
             <ChevronDown size={16} />
          </div>
          <div className="flex-1">
             <div className="flex justify-between font-mono text-sm mb-1">
               <span className="font-bold">465 GB used</span>
               <span className="opacity-60">1.81 TB free</span>
             </div>
             <div className={cn("h-6 p-[2px] bg-white", NEO_BORDER)}>
               <div className="h-full bg-orange-500 w-1/4" />
             </div>
          </div>
          <NeoButton variant="primary" className="flex items-center gap-2">
            <RefreshCw size={18} /> Scan
          </NeoButton>
        </div>

        <div className="flex-1 p-4">
          <NeoCard className="h-full p-0 overflow-hidden flex flex-col" noShadow>
            <div className="flex-1 bg-neutral-900 p-1">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={SPACE_DATA}
                  dataKey="size"
                  stroke="#171717"
                  fill="#fff"
                  content={<CustomTreemapContent />}
                >
                  <Tooltip 
                    content={({ payload }) => {
                      if (!payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className={cn("bg-white p-2 font-mono text-sm z-50", NEO_BORDER, NEO_SHADOW_SM)}>
                          <div className="font-bold">{data.name}</div>
                          <div>{(data.size / 1000).toFixed(1)} GB</div>
                        </div>
                      );
                    }}
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>
          </NeoCard>
        </div>
      </div>
    </WindowFrame>
  );
};

// --- MAIN LAUNCHER --- //

const LauncherApp = ({ onLaunch }: { onLaunch: (app: string) => void }) => {
  const AppButton = ({ id, icon: Icon, title, desc, colorCls }: any) => (
    <button 
      onClick={() => onLaunch(id)}
      className={cn(
        'group relative flex flex-col p-6 text-left transition-all',
        NEO_BORDER, COLORS.surface, NEO_SHADOW,
        'hover:-translate-y-1 hover:translate-x-[-1px] hover:shadow-[6px_6px_0px_0px_rgba(23,23,23,1)]',
        'active:translate-y-[2px] active:translate-x-[2px] active:shadow-none'
      )}
    >
      <div className={cn(
        "w-16 h-16 mb-6 flex items-center justify-center border-2 border-neutral-900",
        colorCls
      )}>
        <Icon size={32} className="text-neutral-900 stroke-[2]" />
      </div>
      <h2 className="text-3xl font-black tracking-tight mb-2">{title}</h2>
      <p className="font-mono text-sm opacity-70 leading-relaxed">{desc}</p>
      <div className="absolute top-4 right-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
        <ArrowLeft size={24} className="rotate-180" />
      </div>
    </button>
  );

  return (
    <div className={cn("min-h-screen w-full flex items-center justify-center p-8", COLORS.bg)}>
      <div className="max-w-5xl w-full space-y-12">
        {/* Header */}
        <div className="flex items-end justify-between border-b-4 border-neutral-900 pb-6">
          <div>
            <h1 className="text-7xl font-black tracking-tighter leading-none mb-2">SETUP<span className="text-orange-600">.</span></h1>
            <p className="font-mono text-lg font-bold opacity-60">POST-INSTALL UTILITY SUITE v1.0</p>
          </div>
          <div className="hidden md:flex gap-4 font-mono text-sm text-right opacity-60">
            <div>
              <div className="font-bold">SYSTEM</div>
              <div>WIN_11_PRO</div>
            </div>
            <div>
               <div className="font-bold">USER</div>
               <div>ADMIN</div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <AppButton 
            id="specs" 
            icon={Cpu} 
            title="Specs"
            desc="Real-time telemetry. CPU, GPU, RAM, and thermal monitoring."
            colorCls="bg-blue-300"
          />
          <AppButton 
            id="unbox" 
            icon={Package} 
            title="Unbox"
            desc="Next-gen archiver. Extract, compress, and manage files quickly."
            colorCls="bg-orange-400"
          />
          <AppButton 
            id="space" 
            icon={BarChart2} 
            title="Space"
            desc="Storage visualizer. Analyze disk usage with interactive treemaps."
            colorCls="bg-green-300"
          />
        </div>

        {/* Footer / Info */}
        <div className="pt-8 text-center md:text-left opacity-50 font-mono text-xs flex justify-between">
           <p>© 2024 NEOLABS. ALL RIGHTS RESERVED.</p>
           <p>PRESS F1 FOR HELP</p>
        </div>
      </div>
    </div>
  );
}

// --- ROOT COMPONENT ---

export default function SetupSuite() {
  const [activeApp, setActiveApp] = useState<string | null>(null);

  // In a real app, we might use a router, but simple state works for a suite like this.
  return (
    <div className="text-neutral-900 selection:bg-orange-200">
      {!activeApp && <LauncherApp onLaunch={setActiveApp} />}
      {activeApp === 'specs' && <SpecsApp onClose={() => setActiveApp(null)} />}
      {activeApp === 'unbox' && <UnboxApp onClose={() => setActiveApp(null)} />}
      {activeApp === 'space' && <SpaceApp onClose={() => setActiveApp(null)} />}
    </div>
  );
}
