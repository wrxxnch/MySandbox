import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SimulationEngine } from './engine/SimulationEngine';
import { GRID_WIDTH, GRID_HEIGHT, ElementProperties } from './types';
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
  Zap,
  Waves,
  Mountain,
  Flame,
  Binary,
  LogIn,
  LogOut,
  User as UserIcon,
  CloudUpload,
  Globe
} from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { auth, loginWithGoogle, logout, saveCustomElements, loadUserElements } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

// --- Components ---

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
  const [user, setUser] = useState<User | null>(null);

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

  const handleExport = () => {
    const data = JSON.stringify(elements.filter(e => e.id.startsWith('custom-')));
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pixel-forge-elements.json';
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as ElementProperties[];
        setElements(prev => {
           const existingIds = new Set(prev.map(p => p.id));
           const newOnes = imported.filter(i => !existingIds.has(i.id));
           return [...prev, ...newOnes];
        });
      } catch (e) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  // Simulation Loop
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { alpha: false });
    if (!ctx) return;

    const engine = new SimulationEngine();
    engineRef.current = engine;
    engine.loadElements(elements);

    let frameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (!isPaused) {
        engine.step();
      }
      engine.render(ctx);

      const delta = time - lastTime;
      if (delta > 0) setFps(Math.round(1000 / delta));
      lastTime = time;

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPaused, elements]);

  // Painting Logic
  const isPainting = useRef(false);
  const handlePointer = (e: React.PointerEvent) => {
    if (!canvasRef.current || !engineRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_WIDTH);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_HEIGHT);

    if (isPainting.current || e.type === 'pointerdown') {
      isPainting.current = true;
      for (let i = -brushSize; i <= brushSize; i++) {
        for (let j = -brushSize; j <= brushSize; j++) {
           if (i*i + j*j <= brushSize*brushSize) {
              engineRef.current.setPixel(x + i, y + j, selectedElement);
           }
        }
      }
    }
  };

  const stopPainting = () => (isPainting.current = false);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-white/20">
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
            onClick={() => setIsPaused(!isPaused)} 
            active={!isPaused}
          />
          <ToolbarButton icon={Trash2} onClick={() => {
              if (engineRef.current) engineRef.current.grid.fill(0);
          }} />
          <div className="h-4 w-[1px] bg-white/10" />
          
          <label className="cursor-pointer">
             <input type="file" className="hidden" accept=".json" onChange={handleImport} />
             <ToolbarButton icon={Upload} onClick={() => {}} />
          </label>
          <ToolbarButton icon={Download} onClick={handleExport} />
          
          {user && (
            <ToolbarButton 
              icon={CloudUpload} 
              onClick={() => saveCustomElements(user.uid, elements)} 
              color="#3b82f6" 
            />
          )}
        </div>
      </header>

      <main className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Left Sidebar: Tools & Elements */}
        <aside className="w-64 border-right border-white/10 bg-[#0f0f0f] flex flex-col">
          <div className="p-4 space-y-6">
            {/* Element Grid */}
            <section>
              <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Elements</h2>
              <div className="grid grid-cols-2 gap-2">
                {elements.map((el) => (
                  <button
                    key={el.id}
                    onClick={() => setSelectedElement(el.id)}
                    className={cn(
                      "group relative flex items-center gap-2 p-2 rounded-lg border border-white/5 transition-all text-left",
                      selectedElement === el.id 
                        ? "bg-white/10 border-white/20 shadow-lg" 
                        : "hover:bg-white/5"
                    )}
                  >
                    <div 
                      className="w-3 h-3 rounded-sm shadow-sm transition-transform group-hover:scale-110" 
                      style={{ backgroundColor: el.color }}
                    />
                    <span className="text-xs font-medium truncate">{el.name}</span>
                    {selectedElement === el.id && (
                      <motion.div 
                        layoutId="active-pill"
                        className="absolute inset-0 border border-white/30 rounded-lg pointer-events-none"
                      />
                    )}
                  </button>
                ))}
                <button 
                   onClick={() => setIsEditorOpen(true)}
                   className="flex items-center gap-2 p-2 rounded-lg border border-white/5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all text-xs font-medium"
                >
                  <Plus size={14} /> New Element
                </button>
              </div>
            </section>

            {/* Brush Controls */}
            <section className="space-y-4">
              <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Brush Settings</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>Size</span>
                  <span>{brushSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="50" 
                  value={brushSize} 
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </section>
          </div>
        </aside>

        {/* Viewport */}
        <div className="flex-1 bg-[#050505] relative flex items-center justify-center p-8 overflow-auto">
          <div className="relative shadow-2xl shadow-black/50 border border-white/5 rounded-sm overflow-hidden">
             <canvas
                ref={canvasRef}
                width={GRID_WIDTH}
                height={GRID_HEIGHT}
                onPointerDown={handlePointer}
                onPointerMove={handlePointer}
                onPointerUp={stopPainting}
                onPointerLeave={stopPainting}
                className="w-full h-auto cursor-crosshair image-render-pixel"
                style={{ imageRendering: 'pixelated' }}
             />
          </div>
          
          {/* HUD Overlay */}
          <div className="absolute top-12 left-12 pointer-events-none">
             <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                   <span className="text-[10px] font-mono text-green-500">SIMULATION_READY</span>
                </div>
                <div className="text-[24px] font-mono font-bold text-white opacity-20">00000.00</div>
             </div>
          </div>
        </div>

        {/* Right Panel: Properties */}
        <aside className="w-72 border-l border-white/10 bg-[#0f0f0f] hidden xl:block">
           <div className="p-4 space-y-6">
              <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">Element Properties</h2>
              {(() => {
                const el = elements.find(e => e.id === selectedElement);
                if (!el) return null;
                return (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3 mb-4">
                           <div className="w-10 h-10 rounded-lg shadow-inner" style={{ backgroundColor: el.color }} />
                           <div>
                              <div className="text-sm font-bold">{el.name}</div>
                              <div className="text-[10px] text-white/40 uppercase font-mono">{el.category}</div>
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <PropertyStat label="Density" value={el.density} unit="kg/m³" />
                           <PropertyStat label="Status" value={el.state} unit="" />
                           <PropertyStat label="BP" value={el.boilingPoint} unit="K" />
                           <PropertyStat label="Cond" value={(el.conductivity * 100).toFixed(0)} unit="%" />
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/5">
                           <button 
                             onClick={() => {
                                setEditingElement(el);
                                setIsEditorOpen(true);
                             }}
                             className="flex items-center justify-center gap-2 p-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-all text-[10px] font-bold uppercase tracking-wider"
                           >
                              <Settings2 size={12} /> Edit
                           </button>
                           <button 
                             onClick={() => {
                                const clone = { ...el, id: 'custom-' + Date.now(), name: el.name + ' (Copy)' };
                                setEditingElement(clone);
                                setIsEditorOpen(true);
                             }}
                             className="flex items-center justify-center gap-2 p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-all text-[10px] font-bold uppercase tracking-wider"
                           >
                              <Plus size={12} /> Clone
                           </button>
                        </div>
                    </div>
                  </div>
                );
              })()}
           </div>
        </aside>
      </main>

      {/* Editor Modal Overlay */}
      <AnimatePresence>
        {isEditorOpen && (
          <ElementEditor 
             elements={elements}
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

function ElementEditor({ elements, onClose, onAdd, initialData }: { elements: ElementProperties[], onClose: () => void, onAdd: (el: ElementProperties) => void, initialData?: Partial<ElementProperties> }) {
  const [formData, setFormData] = useState<Partial<ElementProperties>>({
    name: 'New Element',
    id: 'custom-' + Date.now(),
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
                    maxLength={3}
                    value={formData.abbreviation} 
                    onChange={e => setFormData({...formData, abbreviation: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-center"
                  />
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Category</label>
                  <input 
                    type="text" 
                    value={formData.category} 
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"
                  />
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

            <div className="grid grid-cols-3 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Acidity (0-14)</label>
                  <input type="number" min="0" max="14" value={formData.acidity} onChange={e => setFormData({...formData, acidity: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">BP (K)</label>
                  <input type="number" value={formData.boilingPoint} onChange={e => setFormData({...formData, boilingPoint: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">FP (K)</label>
                  <input type="number" value={formData.freezingPoint} onChange={e => setFormData({...formData, freezingPoint: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm"/>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40">Boils into</label>
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
                  <label className="text-[10px] uppercase font-bold text-white/40">Freezes into</label>
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
                        <select 
                          value={reaction.targetElementId} 
                          onChange={e => updateReaction(i, 'targetElementId', e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-white/5 rounded p-1 text-[11px]"
                        >
                          {elements.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                        </select>
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
