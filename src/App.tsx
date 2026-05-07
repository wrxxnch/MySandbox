import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SimulationEngine } from './engine/SimulationEngine';
import { GRID_WIDTH, GRID_HEIGHT, ElementProperties, ViewMode } from './types';
import { BASE_ELEMENTS } from './constants';
import { 
  Eraser, 
  Download, 
  Upload, 
  Trash2, 
  Settings2, 
  Plus, 
  Save, 
  Play, 
  Pause,
  Undo,
  Redo,
  Search,
  Zap,
  Waves,
  Mountain,
  Flame,
  Binary,
  LogIn,
  LogOut,
  User as UserIcon,
  CloudUpload,
  Globe,
  Grid3X3,
  Droplets,
  Wind,
  Box,
  Bomb,
  Radio,
  Eye,
  MoveUp,
  Heart,
  Star,
  Hammer,
  Square
} from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { auth, loginWithGoogle, logout, saveCustomElements, loadUserElements } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

// --- Utils ---

const formatTemp = (k: number, unit: 'K' | 'C' | 'F') => {
  if (unit === 'C') return (k - 273.15).toFixed(2) + '°C';
  if (unit === 'F') return ((k - 273.15) * 9/5 + 32).toFixed(2) + '°F';
  return k.toFixed(2) + 'K';
};

const parseTemp = (val: string): number => {
  const cleanVal = val.trim();
  if (cleanVal === '' || cleanVal === '-' || cleanVal === '.') return NaN;
  const num = parseFloat(cleanVal);
  if (isNaN(num)) return NaN;
  const unit = val.toUpperCase().replace(/[^A-Z]/g, '');
  if (unit.includes('C')) return num + 273.15;
  if (unit.includes('F')) return (num - 32) * 5/9 + 273.15;
  return num;
};

const CATEGORIES = [
  { id: 'walls', name: 'Walls', icon: Square },
  { id: 'electronics', name: 'Electronics', icon: Zap },
  { id: 'powered', name: 'Powered Materials', icon: Zap },
  { id: 'powders', name: 'Powders', icon: Grid3X3 },
  { id: 'liquids', name: 'Liquids', icon: Droplets },
  { id: 'gases', name: 'Gasses', icon: Wind },
  { id: 'solids', name: 'Solids', icon: Box },
  { id: 'explosives', name: 'Explosives', icon: Bomb },
  { id: 'radioactive', name: 'Radioactive', icon: Radio },
  { id: 'sensors', name: 'Sensors', icon: Eye },
  { id: 'force', name: 'Force', icon: MoveUp },
  { id: 'life', name: 'Life', icon: Heart },
  { id: 'special', name: 'Special', icon: Star },
  { id: 'tools', name: 'Tools', icon: Hammer },
  { id: 'custom', name: 'Custom', icon: UserIcon },
];

const TemperatureInput = ({ 
  value, 
  onChange, 
  unit,
  className 
}: { 
  value: number, 
  onChange: (val: number) => void, 
  unit: 'K' | 'C' | 'F',
  className?: string
}) => {
  const [localVal, setLocalVal] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setLocalVal(formatTemp(value, unit));
    }
  }, [value, unit, isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseTemp(localVal);
    if (!isNaN(parsed)) {
      onChange(parsed);
    } else {
      setLocalVal(formatTemp(value, unit));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(e.target.value);
    // Optional: immediate parsing if it looks like a number
    if (e.target.value.trim() !== '') {
        const p = parseTemp(e.target.value);
        if (!isNaN(p)) onChange(p);
    }
  };

  return (
    <input
      type="text"
      value={localVal}
      onFocus={() => {
          setIsEditing(true);
          setLocalVal(formatTemp(value, unit).replace(/[°KCF]/g, ''));
      }}
      onBlur={handleBlur}
      onChange={handleChange}
      className={className}
    />
  );
};

const ToolbarButton = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick, 
  color 
}: { 
  icon: any, 
  label?: string, 
  active?: boolean, 
  onClick: () => void,
  color?: string
}) => (
  <button
    onClick={onClick}
    className={cn(
      "p-2 rounded-lg transition-all flex items-center gap-2",
      active 
        ? "bg-white/20 text-white shadow-lg" 
        : "text-white/60 hover:bg-white/10 hover:text-white"
    )}
    style={color && active ? { boxShadow: `0 0 10px ${color}` } : {}}
  >
    <Icon size={20} />
    {label && <span className="text-xs font-medium">{label}</span>}
  </button>
);

const ExportOption = ({ 
  label, 
  desc, 
  onClick 
}: { 
  label: string, 
  desc: string, 
  onClick: () => void 
}) => (
  <button
    onClick={onClick}
    className="w-full flex flex-col items-start px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
  >
    <span className="text-xs font-bold text-white/80">{label}</span>
    <span className="text-[10px] text-white/40">{desc}</span>
  </button>
);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const [elements, setElements] = useState<ElementProperties[]>(BASE_ELEMENTS);
  const [selectedElement, setSelectedElement] = useState<string>('sand');
  const [brushSize, setBrushSize] = useState(5);
  const [isPaused, setIsPaused] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingElement, setEditingElement] = useState<ElementProperties | null>(null);
  const [fps, setFps] = useState(0);
  const mousePos = useRef({ x: -1, y: -1 });
  const [hoverData, setHoverData] = useState<any>(null);
  const [tempUnit, setTempUnit] = useState<'K' | 'C' | 'F'>('C');
  const [searchQuery, setSearchQuery] = useState('');
  const [brushOverwrite, setBrushOverwrite] = useState(false);
  const [brushTemp, setBrushTemp] = useState<number>(293.15); // Default room temp
  const [brushCtype, setBrushCtype] = useState<string>('empty');
  const [viewTransform, setViewTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [detectionThreshold, setDetectionThreshold] = useState<number>(300); // 300C
  const [particleSeed, setParticleSeed] = useState<string>("pixelforge");
  const [particleFriction, setParticleFriction] = useState<number>(0.95);
  const [particleRadius, setParticleRadius] = useState<number>(80);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.NORMAL);
  const [wifiChannel, setWifiChannel] = useState<number>(1);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'elements' | 'deco' | 'props'>('elements');
  const [selectedDecoColor, setSelectedDecoColor] = useState<string>('#ffffff');
  const [user, setUser] = useState<User | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('powders');
  const [hudLayout, setHudLayout] = useState<'modern' | 'classic'>('classic');
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isBottomBarHovered, setIsBottomBarHovered] = useState(false);
  const [sidebarPosition, setSidebarPosition] = useState<'left' | 'right'>('right');
  const [isMagnifierActive, setIsMagnifierActive] = useState(false);
  const [magnifierScale, setMagnifierScale] = useState(4);
  const [showSettings, setShowSettings] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setViewTransform({ scale: 1, x: 0, y: 0 });
    }
  }, [isMobile]);

  const saveToHistory = () => {
    if (!engineRef.current) return;
    const snapshot = engineRef.current.getSnapshot();
    setHistory(prev => {
      const newHist = prev.slice(0, historyIndex + 1);
      newHist.push(snapshot);
      if (newHist.length > 20) newHist.shift();
      return newHist;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 19));
  };

  const undo = () => {
    if (historyIndex <= 0 || !engineRef.current) return;
    const prevIdx = historyIndex - 1;
    engineRef.current.restoreSnapshot(history[prevIdx]);
    setHistoryIndex(prevIdx);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1 || !engineRef.current) return;
    const nextIdx = historyIndex + 1;
    engineRef.current.restoreSnapshot(history[nextIdx]);
    setHistoryIndex(nextIdx);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
           e.preventDefault();
           if (e.shiftKey) redo();
           else undo();
        } else if (e.key === 'y') {
           e.preventDefault();
           redo();
        } else if (e.key === 'b') {
           e.preventDefault();
           if (engineRef.current) {
             engineRef.current.showDecoration = !engineRef.current.showDecoration;
           }
        }
      } else {
        if (e.key === 'z') {
           setIsMagnifierActive(prev => !prev);
        }
        if (e.key === 'b') {
          setActiveSidebarTab('deco');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.viewMode = viewMode;
  }, [viewMode]);

  const formatTempHUD = (k: number) => formatTemp(k, tempUnit);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        loadUserElements(u.uid).then(userEls => {
           setElements(prev => {
              const baseIds = new Set(BASE_ELEMENTS.map(e => e.id));
              const uniqueUserEls = userEls.filter(e => !baseIds.has(e.id));
              return [...BASE_ELEMENTS, ...uniqueUserEls];
           });
        });
      }
    });
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const executeExport = (choice: '1' | '2' | '3') => {
    let elementsToExport: ElementProperties[] = [];
    if (choice === '1') {
      elementsToExport = elements;
    } else if (choice === '2') {
      elementsToExport = elements.filter(e => e.id.startsWith('custom-'));
    } else if (choice === '3') {
      elementsToExport = elements.filter(e => !e.id.startsWith('custom-'));
    }

    if (elementsToExport.length === 0) {
      alert("Nenhum elemento encontrado para exportação.");
      return;
    }

    try {
      const data = JSON.stringify(elementsToExport, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const suffix = choice === '1' ? 'full' : choice === '2' ? 'custom' : 'base';
      a.download = `pixelforge-elements-${suffix}.json`;
      
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Falha ao exportar elementos.");
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as ElementProperties[];
        if (!Array.isArray(imported)) throw new Error("Format invalid");

        const replace = window.confirm("Substituir elementos existentes com o mesmo ID? (Cancelar criará duplicatas com número na frente)");
        
        setElements(prev => {
           let next = [...prev];
           imported.forEach(imp => {
              if (!imp.id) return;
              const index = next.findIndex(n => n.id === imp.id);
              if (index >= 0) {
                 if (replace) {
                    next[index] = imp;
                 } else {
                    const newId = imp.id + '-' + Math.floor(Math.random() * 1000);
                    const newName = imp.name + ' (New)';
                    next.push({ ...imp, id: newId, name: newName });
                 }
              } else {
                 next.push(imp);
              }
           });
           return next;
        });
      } catch (err) {
        alert("Arquivo JSON inválido ou formato incorreto.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Simulation Engine Initialization
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new SimulationEngine();
    }
    engineRef.current.loadElements(elements);
  }, [elements]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.randomizeParticleForces(particleSeed);
    }
  }, [particleSeed]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setFriction(particleFriction);
    }
  }, [particleFriction]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setInteractionRadius(particleRadius);
    }
  }, [particleRadius]);

  // Simulation Loop
  useEffect(() => {
    if (!canvasRef.current || !engineRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { alpha: false });
    if (!ctx) return;

    let frameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (!engineRef.current) return;
      
      if (!isPaused) {
        engineRef.current.step();
      }
      engineRef.current.render(ctx!);

      // HUD Update
      if (mousePos.current.x >= 0) {
          const rect = canvasRef.current!.getBoundingClientRect();
          const xInput = Math.floor(((mousePos.current.x - rect.left) / rect.width) * GRID_WIDTH);
          const yInput = Math.floor(((mousePos.current.y - rect.top) / rect.height) * GRID_HEIGHT);

          if (xInput >= 0 && xInput < GRID_WIDTH && yInput >= 0 && yInput < GRID_HEIGHT) {
              const idx = yInput * GRID_WIDTH + xInput;
              const elIdx = engineRef.current.grid[idx];
              const el = engineRef.current.elementList[elIdx];
              const ctypeIdx = engineRef.current.ctypeGrid[idx];
              const ctypeEl = engineRef.current.elementList[ctypeIdx];
              setHoverData({
                  name: el.name,
                  id: el.id,
                  abbr: el.abbreviation || el.name.substring(0, 4).toUpperCase(),
                  tempK: engineRef.current.tempGrid[idx],
                  pressure: engineRef.current.pressureGrid[idx].toFixed(2),
                  life: engineRef.current.lifeGrid[idx],
                  ctype: ctypeEl ? ctypeEl.id : '---',
                  ctypeName: ctypeEl ? ctypeEl.name : 'None',
                  x: xInput,
                  y: yInput,
                  idx,
                  elIdx
              });
          }
      }

      const delta = time - lastTime;
      if (delta > 0) setFps(Math.round(1000 / delta));
      lastTime = time;

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPaused]); // Only restart loop when paused state changes to update the click handler closure

  // Painting Logic
  const isPainting = useRef(false);
  const handlePointer = (e: React.PointerEvent) => {
    if (!canvasRef.current || !engineRef.current) return;

    if (e.type === 'pointerdown') {
      // Middle click (4) or Ctrl+Left click (1 + ctrlKey) for Panning
      if (e.buttons === 4 || (e.buttons === 1 && e.ctrlKey) || e.shiftKey) {
        setIsPanning(true);
        return;
      }
      saveToHistory();
    }
    
    if (isPanning) {
      if (!isMobile) {
        setViewTransform(prev => ({
          ...prev,
          x: prev.x + e.movementX,
          y: prev.y + e.movementY
        }));
      }
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = rect.width / GRID_WIDTH;
    const scaleY = rect.height / GRID_HEIGHT;
    const x = Math.floor((e.clientX - rect.left) / scaleX);
    const y = Math.floor((e.clientY - rect.top) / scaleY);

    if (isPainting.current || e.type === 'pointerdown') {
      isPainting.current = true;
      const elProp = elements.find(e => e.id === selectedElement);
      
      for (let i = -brushSize; i <= brushSize; i++) {
        for (let j = -brushSize; j <= brushSize; j++) {
           if (i*i + j*j <= brushSize*brushSize) {
              const nx = x + i;
              const ny = y + j;

              if (activeSidebarTab === 'deco') {
                engineRef.current!.setDeco(nx, ny, e.shiftKey ? null : selectedDecoColor);
                continue;
              }

              if (elProp?.isParticleLife) {
                 if (Math.random() < 0.2) {
                   engineRef.current!.spawnParticle(nx, ny, Math.floor(Math.random() * 6));
                 }
                 continue;
              }

              const options: any = { overwrite: brushOverwrite };
              if (selectedElement === 'prop' || selectedElement === 'clne') {
                options.temp = brushTemp;
                options.ctype = brushCtype;
                options.overwrite = true;
              }
              if (elProp?.category === 'sensors') {
                 options.ctypeIdNum = detectionThreshold + 273.15; // Pass numeric ctype
              }
              if (selectedElement === 'wifi') {
                 options.ctypeIdNum = wifiChannel;
              }
              engineRef.current!.setPixel(nx, ny, selectedElement, options);
           }
        }
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isMobile) return;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewTransform(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(10, prev.scale * delta))
    }));
  };

  const stopPainting = () => {
    isPainting.current = false;
    setIsPanning(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-white/20 flex flex-col">
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h2 className="text-xs font-bold uppercase tracking-widest">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white"><Plus className="rotate-45" size={20} /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                   <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-widest">UI Layout</h3>
                   <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setHudLayout('classic')} className={cn("py-2 rounded border text-[10px] uppercase font-bold", hudLayout === 'classic' ? "bg-white/20 border-white/20" : "bg-white/5 border-white/5 text-white/40")}>Classic</button>
                      <button onClick={() => setHudLayout('modern')} className={cn("py-2 rounded border text-[10px] uppercase font-bold", hudLayout === 'modern' ? "bg-white/20 border-white/20" : "bg-white/5 border-white/5 text-white/40")}>Modern</button>
                   </div>
                </div>
                {hudLayout === 'classic' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Sidebar Position</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setSidebarPosition('left')} className={cn("py-2 rounded border text-[10px] uppercase font-bold", sidebarPosition === 'left' ? "bg-white/20 border-white/20" : "bg-white/5 border-white/5 text-white/40")}>Left</button>
                         <button onClick={() => setSidebarPosition('right')} className={cn("py-2 rounded border text-[10px] uppercase font-bold", sidebarPosition === 'right' ? "bg-white/20 border-white/20" : "bg-white/5 border-white/5 text-white/40")}>Right</button>
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                   <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Temperature Unit</h3>
                   <div className="grid grid-cols-3 gap-2">
                      {['C', 'F', 'K'].map(u => (
                        <button key={u} onClick={() => setTempUnit(u as any)} className={cn("py-2 rounded border text-[10px] uppercase font-bold", tempUnit === u ? "bg-white/20 border-white/20" : "bg-white/5 border-white/5 text-white/40")}>{u}</button>
                      ))}
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Properties Modal */}
      <AnimatePresence>
        {showProps && elements.find(e => e.id === selectedElement) && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h2 className="text-xs font-bold uppercase tracking-widest">Element Properties</h2>
                <button onClick={() => setShowProps(false)} className="text-white/40 hover:text-white"><Plus className="rotate-45" size={20} /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                   <div className="w-12 h-12 rounded shadow-inner" style={{ backgroundColor: elements.find(e => e.id === selectedElement)!.color }} />
                   <div>
                      <div className="text-sm font-bold">{elements.find(e => e.id === selectedElement)!.name}</div>
                      <div className="text-[10px] text-white/40 uppercase font-mono">{selectedElement}</div>
                   </div>
                </div>

                {selectedElement === 'wifi' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">WiFi Channel (0-65000)</label>
                    <input 
                      type="number"
                      value={wifiChannel}
                      onChange={(e) => setWifiChannel(Math.max(0, Math.min(65000, parseInt(e.target.value) || 0)))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white font-mono"
                    />
                  </div>
                )}

                {(selectedElement === 'sensor' || elements.find(e => e.id === selectedElement)?.category === 'sensors') && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Detection Temp (°C)</label>
                    <input 
                      type="number"
                      value={detectionThreshold}
                      onChange={(e) => setDetectionThreshold(parseInt(e.target.value) || 0)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white font-mono"
                    />
                  </div>
                )}

                <button onClick={() => { setIsEditorOpen(true); setShowProps(false); }} className="w-full py-3 bg-blue-600 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all">
                  Open Engine Editor
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Top HUD Bar */}
      <div className="h-6 bg-black/40 border-b border-white/5 flex items-center px-6 gap-6 overflow-hidden shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-orange-500' : 'bg-green-500 animate-pulse'}`} />
          <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest leading-none">
            {isPaused ? 'PAUSED' : 'RUNNING'}
          </span>
        </div>
        
        {hoverData ? (
          <div className="flex items-center gap-4 text-[10px] font-mono whitespace-nowrap">
            <span className="text-blue-400 font-bold">{hoverData.abbr}</span>
            <span className="text-white/60">Temp: <span className="text-orange-400" onClick={() => setTempUnit(u => u === 'K' ? 'C' : u === 'C' ? 'F' : 'K')}>{formatTempHUD(hoverData.tempK)}</span></span>
            <span className="text-white/60">Pressure: <span className="text-pink-400">{hoverData.pressure}</span></span>
            <span className="text-white/60">CTYPE: <span className="text-cyan-400">{hoverData.ctype}</span></span>
            <span className="text-white/60">#<span className="text-white/40">{hoverData.elIdx}</span></span>
            <span className="text-white/60">X:<span className="text-white/80">{hoverData.x}</span> Y:<span className="text-white/80">{hoverData.y}</span></span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-white/20 italic uppercase tracking-wider">Hover canvas for particle data...</span>
        )}

        <div className="ml-auto flex items-center gap-4">
           <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">{fps} FPS</div>
        </div>
      </div>

      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0f0f0f]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Binary size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase">PixelForge</h1>
            <p className="text-[10px] text-white/40 uppercase tracking-widest">Advanced Particle Sandbox</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-1 rounded">
             {fps} FPS | {GRID_WIDTH}x{GRID_HEIGHT}
          </div>
          <div className="h-4 w-[1px] bg-white/10" />
          
          <ToolbarButton 
            icon={Eraser} 
            label="Eraser"
            onClick={() => setSelectedElement('empty')} 
            active={selectedElement === 'empty'}
          />
          
          <div className="h-4 w-[1px] bg-white/10" />
          
          {user ? (
            <div className="flex items-center gap-2">
               <img src={user.photoURL || ''} className="w-6 h-6 rounded-full border border-white/10" alt="avatar" />
               <button onClick={() => logout()} className="text-[10px] text-white/40 hover:text-white uppercase font-bold tracking-widest">Logout</button>
            </div>
          ) : (
            <button onClick={() => loginWithGoogle()} className="flex items-center gap-2 text-[10px] text-white/40 hover:text-white uppercase font-bold tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              <LogIn size={12} /> Login
            </button>
          )}

          <div className="h-4 w-[1px] bg-white/10" />
          <ToolbarButton 
            icon={isPaused ? Play : Pause} 
            label={isPaused ? "Play" : "Pause"}
            onClick={() => setIsPaused(!isPaused)} 
            active={!isPaused}
          />
          <ToolbarButton icon={Undo} label="Undo" onClick={undo} />
          <ToolbarButton icon={Redo} label="Redo" onClick={redo} />
          <ToolbarButton icon={Trash2} label="Clear" onClick={() => {
              if (engineRef.current) engineRef.current.clear();
          }} />
          <div className="h-4 w-[1px] bg-white/10" />
          
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept=".json" 
            onChange={handleImport} 
          />
          <ToolbarButton icon={Upload} label="Import" onClick={() => fileInputRef.current?.click()} />
          <div className="relative">
            <ToolbarButton 
              icon={Download} 
              label="Export" 
              active={showExportMenu}
              onClick={() => setShowExportMenu(!showExportMenu)} 
            />
            <AnimatePresence>
              {showExportMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full mt-2 right-0 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-2 z-[100] w-56 flex flex-col gap-1 overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-white/5 mb-1">
                    <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Select Mode</span>
                  </div>
                  <ExportOption 
                    label="All Elements" 
                    desc="Everything in the current set"
                    onClick={() => { executeExport('1'); setShowExportMenu(false); }} 
                  />
                  <ExportOption 
                    label="Custom Elements" 
                    desc="Only items you created"
                    onClick={() => { executeExport('2'); setShowExportMenu(false); }} 
                  />
                  <ExportOption 
                    label="Base Elements" 
                    desc="Original library properties"
                    onClick={() => { executeExport('3'); setShowExportMenu(false); }} 
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {user && (
            <ToolbarButton 
              icon={CloudUpload} 
              onClick={() => saveCustomElements(user.uid, elements)} 
              color="#3b82f6" 
            />
          )}

          <div className="h-4 w-[1px] bg-white/10" />
          <ToolbarButton 
            icon={Settings2} 
            label="Settings"
            onClick={() => setShowSettings(true)} 
            active={showSettings}
          />
        </div>
      </header>

      <main className={cn(
        "flex flex-col lg:flex-row overflow-hidden portrait:flex-row landscape:flex-col-reverse relative flex-1 min-h-0",
        hudLayout === 'classic' ? "bg-black" : ""
      )}>
        {hudLayout === 'modern' ? (
          <>
            <aside 
              onMouseEnter={() => setIsSidebarHovered(true)}
              onMouseLeave={() => setIsSidebarHovered(false)}
              className={cn(
                "bg-[#0f0f0f] border-white/10 flex flex-col shrink-0 transition-all duration-300 z-50",
                "portrait:w-20 portrait:border-r portrait:h-full sm:portrait:w-48 md:portrait:w-64",
                "landscape:w-full landscape:h-40 landscape:border-t",
                "lg:w-72 lg:h-full lg:border-r lg:border-t-0"
              )}
            >
              <div className="flex border-b border-white/10 overflow-x-auto scrollbar-hide">
                <button 
                  onClick={() => setActiveSidebarTab('elements')}
                  className={cn(
                    "flex-1 py-3 px-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all min-w-fit whitespace-nowrap",
                    activeSidebarTab === 'elements' ? "bg-white/5 text-blue-400 border-b-2 border-blue-500" : "text-white/40 hover:text-white/60"
                  )}
                >Elements</button>
                <button 
                  onClick={() => setActiveSidebarTab('deco')}
                  className={cn(
                    "flex-1 py-3 px-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all min-w-fit whitespace-nowrap",
                    activeSidebarTab === 'deco' ? "bg-white/5 text-pink-400 border-b-2 border-pink-500" : "text-white/40 hover:text-white/60"
                  )}
                >Deco</button>
              </div>

              <div className="p-2 sm:p-4 flex-1 overflow-auto space-y-6 custom-scrollbar">
                {activeSidebarTab === 'elements' && (
                  <section className="space-y-4">
                    {CATEGORIES.map(cat => {
                      const catElements = elements.filter(el => {
                        if (cat.id === 'custom') return el.id.startsWith('custom-');
                        return el.category === cat.id && !el.id.startsWith('custom-');
                      }).filter(el => el.name.toLowerCase().includes(searchQuery.toLowerCase()));
                      if (catElements.length === 0) return null;
                      return (
                        <div key={cat.id} className="space-y-1.5">
                          <h3 className="text-[8px] sm:text-[9px] font-bold text-white/20 uppercase tracking-[0.2em]">{cat.name}</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {catElements.map(el => (
                              <button
                                key={el.id}
                                onClick={() => setSelectedElement(el.id)}
                                className={cn(
                                  "flex items-center gap-1.5 p-1.5 rounded border border-white/5 transition-all",
                                  selectedElement === el.id ? "bg-white/10 border-blue-500/30" : "hover:bg-white/5"
                                )}
                              >
                                <div className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: el.color }} />
                                <span className="text-[10px] truncate leading-tight">{el.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                )}
                {activeSidebarTab === 'deco' && (
                  <div className="grid grid-cols-6 gap-2">
                    {['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500'].map(c => (
                      <button key={c} onClick={() => setSelectedDecoColor(c)} className="aspect-square rounded border border-white/10" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <div className="flex-1 relative bg-[#050505] overflow-hidden">
               <canvas ref={canvasRef} width={GRID_WIDTH} height={GRID_HEIGHT} onPointerDown={handlePointer} onPointerMove={handlePointer} onPointerUp={stopPainting} onPointerLeave={stopPainting} onWheel={handleWheel} className="w-full h-full object-contain image-pixelated cursor-crosshair" />
            </div>

            <aside className="w-80 border-l border-white/10 bg-[#0f0f0f] hidden xl:flex flex-col p-4 overflow-auto custom-scrollbar">
               <h2 className="text-[10px] uppercase font-bold text-white/40 tracking-widest mb-4">Properties</h2>
               {elements.find(e => e.id === selectedElement) && (
                 <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded shadow-inner" style={{ backgroundColor: elements.find(e => e.id === selectedElement)!.color }} />
                     <div className="text-sm font-bold">{elements.find(e => e.id === selectedElement)!.name}</div>
                   </div>
                   <button onClick={() => setIsEditorOpen(true)} className="w-full py-2 bg-blue-600/20 text-blue-400 rounded-lg text-xs font-bold uppercase">Edit Base</button>
                 </div>
               )}
            </aside>
          </>
        ) : (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <div className="flex-1 relative bg-black flex">
              {/* Left Sidebar if position is left */}
              {sidebarPosition === 'left' && (
                <div 
                  onMouseEnter={() => setIsSidebarHovered(true)} 
                  onMouseLeave={() => setIsSidebarHovered(false)} 
                  className={cn(
                    "w-12 border-r border-white/10 bg-[#0f0f0f] flex flex-col items-center py-2 gap-1 transition-all duration-300 z-50 overflow-y-auto custom-scrollbar shrink-0",
                    !isSidebarHovered && "opacity-40 grayscale"
                  )}
                >
                  {CATEGORIES.map(cat => (
                    <button 
                      key={cat.id} 
                      onClick={() => setSelectedCategory(cat.id)} 
                      className={cn(
                        "w-10 h-10 flex items-center justify-center rounded transition-all",
                        selectedCategory === cat.id ? "bg-white/20 text-white border border-white/20" : "text-white/40 hover:bg-white/5"
                      )}
                    >
                      <cat.icon size={18} />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center" onWheel={handleWheel}>
                <canvas 
                  ref={canvasRef} 
                  width={GRID_WIDTH} 
                  height={GRID_HEIGHT} 
                  onPointerDown={handlePointer} 
                  onPointerMove={(e) => { mousePos.current = { x: e.clientX, y: e.clientY }; handlePointer(e); }} 
                  onPointerUp={stopPainting} 
                  onPointerLeave={stopPainting} 
                  className="w-full h-full object-contain cursor-crosshair touch-none border-2 border-white/20"
                  style={{ imageRendering: 'pixelated', transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})` }}
                />

                {/* Magnifier Preview Tool */}
                {isMagnifierActive && (
                  <div 
                    className="absolute z-[150] pointer-events-none border-2 border-blue-500 shadow-2xl rounded-sm overflow-hidden bg-black"
                    style={{
                      left: mousePos.current.x - (isMobile ? 0 : 200),
                      top: mousePos.current.y - (isMobile ? 150 : 200),
                      width: 150,
                      height: 150,
                      display: (mousePos.current.x < 0) ? 'none' : 'block'
                    }}
                  >
                    <div className="absolute top-0 right-0 bg-blue-600 text-[8px] font-bold px-1 py-0.5">{magnifierScale}x</div>
                    <canvas 
                       width={150} height={150}
                       ref={(el) => {
                         if (!el || !canvasRef.current || !isMagnifierActive) return;
                         const ctx = el.getContext('2d');
                         if (!ctx) return;
                         const rect = canvasRef.current.getBoundingClientRect();
                         const sx = (mousePos.current.x - rect.left) * (GRID_WIDTH / rect.width);
                         const sy = (mousePos.current.y - rect.top) * (GRID_HEIGHT / rect.height);
                         ctx.imageSmoothingEnabled = false;
                         ctx.clearRect(0, 0, 150, 150);
                         const size = 150 / magnifierScale;
                         ctx.drawImage(canvasRef.current, sx - size/2, sy - size/2, size, size, 0, 0, 150, 150);
                         // Center crosshair
                         ctx.strokeStyle = 'white';
                         ctx.lineWidth = 0.5;
                         ctx.beginPath();
                         ctx.moveTo(75, 70); ctx.lineTo(75, 80);
                         ctx.moveTo(70, 75); ctx.lineTo(80, 75);
                         ctx.stroke();
                       }}
                    />
                  </div>
                )}
              </div>

              {/* Right Sidebar - Categories */}
              {sidebarPosition === 'right' && (
                <div 
                  onMouseEnter={() => setIsSidebarHovered(true)} 
                  onMouseLeave={() => setIsSidebarHovered(false)} 
                  className={cn(
                    "w-12 border-l border-white/10 bg-[#0f0f0f] flex flex-col items-center py-2 gap-1 transition-all duration-300 z-50 overflow-y-auto custom-scrollbar shrink-0",
                    !isSidebarHovered && "opacity-40 grayscale"
                  )}
                >
                  {CATEGORIES.map(cat => (
                    <button 
                      key={cat.id} 
                      onClick={() => setSelectedCategory(cat.id)} 
                      className={cn(
                        "w-10 h-10 flex items-center justify-center rounded transition-all",
                        selectedCategory === cat.id ? "bg-white/20 text-white border border-white/20" : "text-white/40 hover:bg-white/5"
                      )}
                    >
                      <cat.icon size={18} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Drawer - Elements */}
            <div 
              onMouseEnter={() => setIsBottomBarHovered(true)} 
              onMouseLeave={() => setIsBottomBarHovered(false)}
              className={cn(
                "h-16 border-t border-white/10 bg-[#0f0f0f] flex items-center px-4 gap-2 transition-all duration-300 z-50 overflow-x-auto scrollbar-hide shrink-0",
                !isBottomBarHovered && !isSidebarHovered && "opacity-40 grayscale"
              )}
            >
              {elements.filter(el => {
                if (selectedCategory === 'custom') return el.id.startsWith('custom-');
                return el.category === selectedCategory && !el.id.startsWith('custom-');
              }).map(el => (
                <button
                  key={el.id}
                  onClick={() => setSelectedElement(el.id)}
                  className={cn(
                    "px-3 h-10 rounded text-[9px] font-bold uppercase tracking-widest border transition-all flex flex-col items-center justify-center min-w-[70px] shrink-0",
                    selectedElement === el.id ? "bg-white text-black border-white" : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                  )}
                >
                  <span className="truncate w-full text-center">{el.name}</span>
                  <div className="w-full h-1 mt-1 rounded-full opacity-50" style={{ backgroundColor: el.color }} />
                </button>
              ))}
              {selectedCategory === 'custom' && (
                <button onClick={() => setIsEditorOpen(true)} className="w-10 h-10 rounded border border-dashed border-white/20 flex items-center justify-center text-white/40 hover:text-white shrink-0">
                  <Plus size={16} />
                </button>
              )}
            </div>

            {/* HUD Overlays */}
            <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1">
               <div className="flex gap-4 text-[9px] font-mono text-white/40 bg-black/40 backdrop-blur-sm px-2 py-1 rounded border border-white/5">
                  <span>FPS: <span className="text-white">{fps}</span></span>
                  {hoverData && (
                    <>
                      <span className="text-blue-400 font-bold">{hoverData.abbr}</span>
                      <span>{formatTempHUD(hoverData.tempK)}</span>
                    </>
                  )}
               </div>
            </div>

            <div className="absolute right-16 bottom-20 pointer-events-none flex flex-col gap-2 items-end">
                {/* Element Properties Access Button */}
                {(selectedElement === 'wifi' || selectedElement === 'sensor' || elements.find(e => e.id === selectedElement)?.category === 'sensors') && (
                  <button onClick={() => setShowProps(true)} className="px-4 py-2 bg-blue-600 rounded-lg text-[10px] font-bold uppercase pointer-events-auto border border-blue-400 shadow-lg mb-2 flex items-center gap-2 hover:bg-blue-500 transition-all">
                    <Settings2 size={12} /> Properties
                  </button>
                )}

                <div className="bg-black/60 backdrop-blur-md p-2 rounded border border-white/5 flex flex-col gap-2 pointer-events-auto shadow-xl">
                   {isMagnifierActive && (
                     <div className="flex gap-1 border-b border-white/10 pb-2 mb-1">
                        {[2, 4, 8].map(m => (
                          <button key={m} onClick={() => setMagnifierScale(m)} className={cn("w-7 h-7 rounded text-[10px] font-bold transition-all", magnifierScale === m ? "bg-blue-600" : "hover:bg-white/5 text-white/40")}>{m}x</button>
                        ))}
                     </div>
                   )}
                   <div className="flex gap-2 items-center">
                     <input type="range" min="1" max="50" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-24 accent-blue-500 cursor-pointer h-1" />
                     <span className="text-[10px] font-mono text-white/60 min-w-[30px]">{brushSize}px</span>
                   </div>
                </div>
                
                <div className="flex gap-2">
                   <button onClick={() => setIsMagnifierActive(!isMagnifierActive)} className={cn("w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border pointer-events-auto shadow-lg transition-all", isMagnifierActive ? "bg-blue-600 border-blue-400 text-white" : "bg-white/10 border-white/10 text-white/60")}>
                      <Search size={18} />
                   </button>
                   <button onClick={() => setIsPaused(!isPaused)} className={cn("w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border pointer-events-auto shadow-lg", isPaused ? "bg-orange-500/20 border-orange-500/50 text-orange-500" : "bg-white/10 border-white/10 text-white/60")}>
                      {isPaused ? <Play size={18} /> : <Pause size={18} />}
                   </button>
                </div>
            </div>
          </div>
        )}
      </main>

      {/* Editor Modal Overlay */}
      <AnimatePresence>
        {isEditorOpen && (
          <ElementEditor 
             elements={elements}
             tempUnit={tempUnit}
             onClose={() => {
                setIsEditorOpen(false);
                setEditingElement(null);
             }} 
             onAdd={(newEl) => {
                setElements(prev => {
                   const exists = prev.findIndex(e => e.id === newEl.id);
                   if (exists >= 0) {
                      const copy = [...prev];
                      copy[exists] = newEl;
                      return copy;
                   }
                   return [...prev, newEl];
                });
             }} 
             initialData={editingElement || undefined}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PropertyStat({ label, value, unit }: { label: string, value: any, unit: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase font-bold text-white/30 tracking-widest">{label}</div>
      <div className="text-xs font-mono">{value}<span className="text-[10px] opacity-40 ml-0.5">{unit}</span></div>
    </div>
  )
}

// --- Element Editor Component ---

function ElementEditor({ elements, tempUnit, onClose, onAdd, initialData }: { elements: ElementProperties[], tempUnit: 'K' | 'C' | 'F', onClose: () => void, onAdd: (el: ElementProperties) => void, initialData?: Partial<ElementProperties> }) {
  const [formData, setFormData] = useState<Partial<ElementProperties>>({
    name: 'New Element',
    abbreviation: '',
    color: '#3b82f6',
    state: 'powder' as any,
    density: 50,
    acidity: 7,
    boilingPoint: 1000,
    freezingPoint: 0,
    vaporElementId: '',
    congealElementId: '',
    conductivity: 0,
    isExplosive: false,
    explosiveTrigger: 'temp',
    category: 'custom',
    reactions: [],
    thermalConductivity: 0.1,
    ...initialData,
    // Ensure ID is unique if cloning
    id: initialData?.id && !initialData.name?.includes('(Copy)') ? initialData.id : 'custom-' + Date.now()
  });

  const addReaction = () => {
    setFormData({
      ...formData,
      reactions: [
        ...(formData.reactions || []),
        { targetElementId: 'water', chance: 0.1, transformIntoId: 'stone' }
      ]
    });
  };

  const updateReaction = (index: number, field: string, value: any) => {
    const newReactions = [...(formData.reactions || [])];
    newReactions[index] = { ...newReactions[index], [field]: value };
    setFormData({ ...formData, reactions: newReactions });
  };

  const removeReaction = (index: number) => {
    setFormData({
      ...formData,
      reactions: (formData.reactions || []).filter((_, i) => i !== index)
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData as ElementProperties);
    onClose();
  };

  const cloneFrom = (elId: string) => {
    const el = elements.find(e => e.id === elId);
    if (el) {
      setFormData({
        ...el,
        id: 'custom-' + Date.now(),
        name: el.name + ' (Copy)'
      });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-[#151515] border border-white/10 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#1a1a1a]">
           <div>
              <h2 className="text-lg font-bold">Forge New Element</h2>
              <p className="text-xs text-white/40">Define physical properties and chemical reactions</p>
           </div>
           <div className="flex items-center gap-4">
              <select 
                className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs"
                onChange={(e) => cloneFrom(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>Clone from existing...</option>
                {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
              </select>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full"><Trash2 size={18} /></button>
           </div>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Basic Properties */}
          <div className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400 border-b border-blue-400/20 pb-2">Basic Identity</h3>
            
            <div className="grid grid-cols-3 gap-4">
               <div className="col-span-2 space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Name</label>
                  <input 
                    type="text" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"
                    required
                  />
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Abbr.</label>
                  <input 
                    type="text" 
                    value={formData.abbreviation} 
                    onChange={e => setFormData({...formData, abbreviation: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-center"
                  />
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Category</label>
                  <select 
                    value={formData.category} 
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm text-white"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Color</label>
                  <div className="flex gap-2">
                     <input 
                        type="color" 
                        value={formData.color} 
                        onChange={e => setFormData({...formData, color: e.target.value})}
                        className="w-10 h-9 bg-transparent border-none p-0 cursor-pointer"
                     />
                     <input 
                        type="text" 
                        value={formData.color} 
                        onChange={e => setFormData({...formData, color: e.target.value})}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-mono"
                     />
                  </div>
               </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400 border-b border-orange-400/20 pb-2 pt-4">Physics & Thermodynamics</h3>
            
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">State</label>
                  <select 
                    value={formData.state}
                    onChange={e => setFormData({...formData, state: e.target.value as any})}
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm"
                  >
                    <option value="solid">Solid (Static)</option>
                    <option value="powder">Powder (Mobile)</option>
                    <option value="liquid">Liquid</option>
                    <option value="gas">Gas</option>
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Density</label>
                  <input type="number" value={formData.density} onChange={e => setFormData({...formData, density: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Melting Point</label>
                  <TemperatureInput 
                    value={formData.boilingPoint || 0} 
                    unit={tempUnit}
                    onChange={val => setFormData({...formData, boilingPoint: val})} 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white"
                  />
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Spawning Temp</label>
                  <TemperatureInput 
                    value={formData.baseTemperature || 293.15} 
                    unit={tempUnit}
                    onChange={val => setFormData({...formData, baseTemperature: val})} 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white"
                  />
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Freezing Point</label>
                  <TemperatureInput 
                    value={formData.freezingPoint || 0} 
                    unit={tempUnit}
                    onChange={val => setFormData({...formData, freezingPoint: val})} 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white"
                  />
               </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-widest text-red-500 border-b border-red-500/20 pb-2 pt-4">Combustion & Decay</h3>
            
            <div className="grid grid-cols-3 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Flammability (0-1)</label>
                  <input type="number" step="0.01" value={formData.flammability || 0} onChange={e => setFormData({...formData, flammability: parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Fuel (0-100)</label>
                  <input type="number" value={formData.fuel || 0} onChange={e => setFormData({...formData, fuel: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Burn Speed</label>
                  <input type="number" step="0.01" value={formData.burnSpeed || 0} onChange={e => setFormData({...formData, burnSpeed: parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Decays Into</label>
                  <select 
                    value={formData.decaysIntoId || ''} 
                    onChange={e => setFormData({...formData, decaysIntoId: e.target.value})}
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm"
                  >
                    <option value="">None</option>
                    {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Decay Chance (0-1)</label>
                  <input type="number" step="0.001" value={formData.decayChance || 0} onChange={e => setFormData({...formData, decayChance: parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Melts into</label>
                  <select 
                    value={formData.vaporElementId} 
                    onChange={e => setFormData({...formData, vaporElementId: e.target.value})}
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm"
                  >
                    <option value="">None</option>
                    {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Congeals into</label>
                  <select 
                    value={formData.congealElementId} 
                    onChange={e => setFormData({...formData, congealElementId: e.target.value})}
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm"
                  >
                    <option value="">None</option>
                    {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                  </select>
               </div>
            </div>
          </div>

          {/* Reactions & Energy */}
          <div className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-yellow-400 border-b border-yellow-400/20 pb-2">Energy & Explosives</h3>
            
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Conductivity (0-1)</label>
                  <input type="number" step="0.1" min="0" max="1" value={formData.conductivity} onChange={e => setFormData({...formData, conductivity: parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Heat Cond. (0-1)</label>
                  <input type="number" step="0.1" min="0" max="1" value={formData.thermalConductivity} onChange={e => setFormData({...formData, thermalConductivity: parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1 flex items-center gap-4 pt-4">
                  <label className="text-[10px] uppercase font-bold text-white/40">Explosive</label>
                  <input type="checkbox" checked={formData.isExplosive} onChange={e => setFormData({...formData, isExplosive: e.target.checked})} className="w-5 h-5 accent-orange-500" />
               </div>
            </div>

            {formData.isExplosive && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-white/40">Explosion Trigger</label>
                <select 
                   value={formData.explosiveTrigger}
                   onChange={e => setFormData({...formData, explosiveTrigger: e.target.value as any})}
                   className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm"
                >
                   <option value="contact">Contact</option>
                   <option value="temp">High Temperature</option>
                   <option value="electricity">Electricity</option>
                </select>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-green-400/20 pb-2 pt-2">
               <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">Chemical Reactions</h3>
               <button type="button" onClick={addReaction} className="text-[10px] bg-green-500/10 text-green-400 px-2 py-1 rounded hover:bg-green-500/20 border border-green-500/20 flex items-center gap-1">
                  <Plus size={12} /> Add Reaction
               </button>
            </div>

            <div className="space-y-3">
              {(formData.reactions || []).map((reaction, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-3 relative group">
                   <button type="button" onClick={() => removeReaction(i)} className="absolute top-2 right-2 text-white/20 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                   </button>
                   <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-white/20">If touches</label>
                        <div className="flex gap-2 items-center">
                          <select 
                            value={reaction.targetElementId} 
                            onChange={e => updateReaction(i, 'targetElementId', e.target.value)}
                            className="flex-1 bg-[#1a1a1a] border border-white/5 rounded p-1 text-[11px]"
                          >
                            {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                          </select>
                          <button 
                            type="button"
                            onClick={() => updateReaction(i, 'isExclude', !reaction.isExclude)}
                            className={`px-2 py-1 rounded text-[9px] font-bold border transition-colors ${
                              reaction.isExclude 
                                ? 'bg-red-500/20 border-red-500/50 text-red-400' 
                                : 'bg-white/5 border-white/10 text-white/40 grayscale hover:grayscale-0'
                            }`}
                            title="Invert Match (All except this element)"
                          >
                            EXCEPT
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-white/20">Transforms to</label>
                        <select 
                          value={reaction.transformIntoId} 
                          onChange={e => updateReaction(i, 'transformIntoId', e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-white/5 rounded p-1 text-[11px]"
                        >
                          {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-white/20">Chance (0-1)</label>
                        <input 
                          type="number" step="0.1" min="0" max="1" 
                          value={reaction.chance} 
                          onChange={e => updateReaction(i, 'chance', parseFloat(e.target.value))}
                          className="w-full bg-white/5 border border-white/5 rounded p-1 text-[11px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-white/20">Target turns to (optional)</label>
                        <select 
                          value={reaction.producesElementId || ''} 
                          onChange={e => updateReaction(i, 'producesElementId', e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-white/5 rounded p-1 text-[11px]"
                        >
                          <option value="">No change</option>
                          {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                        </select>
                      </div>
                   </div>
                </div>
              ))}
              {(!formData.reactions || formData.reactions.length === 0) && (
                <p className="text-[10px] text-center text-white/20 italic">No reactions defined.</p>
              )}
            </div>
          </div>

          <div className="md:col-span-2 pt-6 border-t border-white/5">
             <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group"
             >
                <Zap size={20} className="group-hover:animate-pulse" />
                Forge Element Definition
             </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
