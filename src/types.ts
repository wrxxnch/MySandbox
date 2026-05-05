export enum PhysicalState {
  SOLID = 'solid', // Static fixed solids (Iron, Stone)
  POWDER = 'powder', // Mobile solids (Sand, Earth)
  LIQUID = 'liquid',
  GAS = 'gas',
}

export interface ElementReaction {
  targetElementId: string; // The element it touches
  chance: number; // 0 to 1
  transformIntoId: string; // What the current element becomes
  producesElementId?: string; // What the target element becomes (optional)
  requiredTemp?: number;
  requiredAcidity?: number;
}

export interface ElementProperties {
  id: string;
  name: string;
  abbreviation?: string;
  color: string;
  state: PhysicalState;
  density: number; // For physics: sand > water > air
  acidity: number; // 0-14 (7 is neutral)
  boilingPoint: number; // In Kelvin
  freezingPoint: number; // In Kelvin
  vaporElementId?: string; // What it turns into when boiling
  congealElementId?: string; // What it turns into when freezing
  conductivity: number; // 0 to 1
  isExplosive: boolean;
  explosiveTrigger?: 'contact' | 'temp' | 'electricity';
  category: string;
  reactions: ElementReaction[];
  isIndestructible?: boolean;
}

export interface SimulationState {
  grid: Uint32Array; // Stores element index/ID
  tempGrid: Float32Array; // Temperature for each pixel
  chargeGrid: Float32Array; // Electricity for each pixel (unused/legacy)
  lifeGrid: Uint8Array; // Electrical life state (0-4)
  width: number;
  height: number;
}

export const GRID_WIDTH = 612;
export const GRID_HEIGHT = 384;
