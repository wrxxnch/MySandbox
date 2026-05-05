import { GRID_WIDTH, GRID_HEIGHT, ElementProperties, PhysicalState } from '../types';
import { BASE_ELEMENTS } from '../constants';

export class SimulationEngine {
  public width: number = GRID_WIDTH;
  public height: number = GRID_HEIGHT;
  public grid: Uint32Array;
  public nextGrid: Uint32Array;
  public chargeGrid: Float32Array;
  public nextChargeGrid: Float32Array;
  public lifeGrid: Uint8Array;
  public nextLifeGrid: Uint8Array;
  public pressureGrid: Float32Array;
  public nextPressureGrid: Float32Array;
  public ctypeGrid: Uint32Array;
  public nextCtypeGrid: Uint32Array;
  public tempGrid: Float32Array;
  public nextTempGrid: Float32Array;
  public elements: Map<string, ElementProperties> = new Map();
  public elementList: ElementProperties[] = [];
  
  // Buffers for visualization
  private imageData: ImageData;
  private buffer: Uint32Array;

  constructor() {
    this.grid = new Uint32Array(this.width * this.height);
    this.nextGrid = new Uint32Array(this.width * this.height);
    this.chargeGrid = new Float32Array(this.width * this.height);
    this.nextChargeGrid = new Float32Array(this.width * this.height);
    this.lifeGrid = new Uint8Array(this.width * this.height);
    this.nextLifeGrid = new Uint8Array(this.width * this.height);
    this.pressureGrid = new Float32Array(this.width * this.height);
    this.nextPressureGrid = new Float32Array(this.width * this.height);
    this.ctypeGrid = new Uint32Array(this.width * this.height);
    this.nextCtypeGrid = new Uint32Array(this.width * this.height);
    this.tempGrid = new Float32Array(this.width * this.height);
    this.tempGrid.fill(293); // Room temperature ~20C in Kelvin
    this.nextTempGrid = new Float32Array(this.width * this.height);
    this.imageData = new ImageData(this.width, this.height);
    this.buffer = new Uint32Array(this.imageData.data.buffer);
    
    this.loadElements(BASE_ELEMENTS);
  }

  public loadElements(elements: ElementProperties[]) {
    this.elementList = [...elements];
    this.elements.clear();
    elements.forEach(el => this.elements.set(el.id, el));
  }

  public setPixel(x: number, y: number, elementId: string, options: { overwrite?: boolean, temp?: number, ctype?: string } = {}) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const index = y * this.width + x;
    
    const existingIdx = this.grid[index];
    const isTool = ['heat', 'cold', 'wind', 'prop', 'electricity'].includes(elementId);
    if (options.overwrite === false && existingIdx !== 0 && !isTool) return;

    if (elementId === 'heat') {
       if (existingIdx !== 0) {
         this.tempGrid[index] = Math.min(this.tempGrid[index] + 150, 3500); 
       }
       return;
    }
    if (elementId === 'cold') {
       if (existingIdx !== 0) {
         this.tempGrid[index] = Math.max(this.tempGrid[index] - 150, 0);
       }
       return;
    }
    if (elementId === 'wind') {
       this.pressureGrid[index] += 15.0;
       return;
    }
    if (elementId === 'prop') {
       if (existingIdx !== 0) {
         if (options.temp !== undefined) this.tempGrid[index] = options.temp;
         if (options.ctype) {
           const ctypeIdx = this.elementList.findIndex(e => e.id === options.ctype);
           if (ctypeIdx >= 0) this.ctypeGrid[index] = ctypeIdx;
         }
       }
       return;
    }

    if (elementId === 'electricity') {
       const elIdx = this.grid[index];
       const el = this.elementList[elIdx];
       if (el && el.conductivity > 0) {
         this.lifeGrid[index] = 4;
       }
       return;
    }

    const elIndex = this.elementList.findIndex(e => e.id === elementId);
    if (elIndex < 0 && elementId !== 'air') return;
    
    this.grid[index] = elIndex >= 0 ? elIndex : 0;
    
    if (options.temp !== undefined) {
      this.tempGrid[index] = options.temp;
    }
    
    if (options.ctype) {
      const ctypeIdx = this.elementList.findIndex(e => e.id === options.ctype);
      if (ctypeIdx >= 0) {
        this.ctypeGrid[index] = ctypeIdx;
      }
    }

    // Add initial charge for dedicated sources
    if (elementId === 'positive') {
      this.lifeGrid[index] = 4;
    } else if (elementId === 'negative') {
       this.lifeGrid[index] = 4;
    }
  }

  public step() {
    // Copy current state to next buffers
    this.nextGrid.set(this.grid);
    this.nextTempGrid.set(this.tempGrid);
    this.nextLifeGrid.fill(0);
    this.nextPressureGrid.fill(0); // Optional: keep some pressure or decay it
    this.nextCtypeGrid.set(this.ctypeGrid);

    // 1. Spark / Electricity Propagation (TPT-like Life Cycle)
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        const life = this.lifeGrid[idx];
        const elIdx = this.grid[idx];
        const el = this.elementList[elIdx];

        if (life > 0) {
           // Decay
           this.nextLifeGrid[idx] = life - 1;

           // Permanent sources
           if (el && (el.id === 'positive' || el.id === 'negative')) {
              this.nextLifeGrid[idx] = 4;
           }
        }

        // Conduction at Life 3
        if (life === 3 && el && el.conductivity > 0) {
           const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
           for (const [dx, dy] of neighbors) {
             const nx = x + dx;
             const ny = y + dy;
             if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
             
             const nIdx = ny * this.width + nx;
             const nEl = this.elementList[this.grid[nIdx]];
             // TPT Logic: Only spark if neighbor is conductive AND life is 0
             // Also ensure we don't spark back to a neighbor that just sparked us (nextLifeGrid check)
             if (nEl && nEl.conductivity > 0 && this.lifeGrid[nIdx] === 0 && this.nextLifeGrid[nIdx] === 0) {
                this.nextLifeGrid[nIdx] = 4;
             }
           }
        }

        // Heat propagation based on thermalConductivity
        const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const selfTC = el?.thermalConductivity ?? 0.05;
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
          const nIdx = ny * this.width + nx;
          const nEl = this.elementList[this.grid[nIdx]];
          const otherTC = nEl?.thermalConductivity ?? 0.05;
          
          const thermalDiff = this.tempGrid[idx] - this.tempGrid[nIdx];
          const transferRate = (selfTC + otherTC) * 0.5;
          if (Math.abs(thermalDiff) > 0.01) {
            this.nextTempGrid[nIdx] += thermalDiff * transferRate;
            this.nextTempGrid[idx] -= thermalDiff * transferRate;
          }
        }
      }
    }
    this.lifeGrid.set(this.nextLifeGrid);
    this.tempGrid.set(this.nextTempGrid);

    // 2. Physics logic
    for (let y = this.height - 1; y >= 0; y--) {
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x;
        const elIdx = this.grid[index];
        if (elIdx === 0) continue; // Air

        const element = this.elementList[elIdx];
        this.updatePixel(x, y, element, elIdx);
      }
    }

    // Swap grids
    const temp = this.grid;
    this.grid = this.nextGrid;
    this.nextGrid = temp;
  }

  private updatePixel(x: number, y: number, element: ElementProperties, elIdx: number) {
    const idx = y * this.width + x;
    const currentTemp = this.tempGrid[idx];

    // State Transitions
    if (element.boilingPoint > 0 && currentTemp >= element.boilingPoint && element.vaporElementId) {
       let targetIdx = this.elementList.findIndex(e => e.id === element.vaporElementId);
       // Use ctype if available
       if (this.ctypeGrid[idx] !== 0) {
         targetIdx = this.ctypeGrid[idx];
         this.nextCtypeGrid[idx] = 0; // Reset ctype after transition
       }
       if (targetIdx >= 0) {
          this.nextGrid[idx] = targetIdx;
          return;
       }
    }
    if (element.freezingPoint > 0 && currentTemp <= element.freezingPoint && element.congealElementId) {
       let targetIdx = this.elementList.findIndex(e => e.id === element.congealElementId);
       // Use ctype if available
       if (this.ctypeGrid[idx] !== 0) {
         targetIdx = this.ctypeGrid[idx];
         this.nextCtypeGrid[idx] = 0;
       }
       if (targetIdx >= 0) {
          this.nextGrid[idx] = targetIdx;
          return;
       }
    }

    const state = element.state;
    const p = this.pressureGrid[idx];

    // Pressure movement (Wind effect)
    if (Math.abs(p) > 2.0 && state !== PhysicalState.SOLID) {
        const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let maxDiff = 0;
        let pTarget = -1;
        for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
            const nIdx = ny * this.width + nx;
            const diff = p - this.pressureGrid[nIdx];
            if (diff > maxDiff && this.grid[nIdx] === 0) {
                maxDiff = diff;
                pTarget = nIdx;
            }
        }
        if (pTarget !== -1 && Math.random() < Math.abs(p) * 0.1) {
            const tx = pTarget % this.width;
            const ty = Math.floor(pTarget / this.width);
            this.movePixel(x, y, tx, ty, elIdx);
            return;
        }
    }

    // FIRE special logic
    if (element.id === 'fire') {
      this.nextPressureGrid[idx] += 2.0; // Fire creates pressure
      if (Math.random() < 0.15) {
        this.nextGrid[idx] = 0;
        return;
      }
      this.nextTempGrid[idx] = Math.min(this.nextTempGrid[idx] + 30, 2500);
    }
    
    // Combustion logic
    if (element.flammability > 0 && currentTemp > 450) {
        if (Math.random() < element.flammability * 0.1) {
            const fireIdx = this.elementList.findIndex(e => e.id === 'fire');
            if (fireIdx >= 0) {
                this.nextGrid[idx] = fireIdx;
                this.nextTempGrid[idx] += 100;
                return;
            }
        }
    }

    // Decay logic
    if (element.decaysIntoId && Math.random() < (element.decayChance || 0)) {
        const targetElIdx = this.elementList.findIndex(e => e.id === element.decaysIntoId);
        if (targetElIdx >= 0) {
            this.nextGrid[idx] = targetElIdx;
            return;
        }
    }
    
    // 3. Reactions & Acidity
    const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        const nIdx = ny * this.width + nx;
        const nElIdx = this.grid[nIdx];
        if (nElIdx === 0) continue;
        const nEl = this.elementList[nElIdx];

        // Custom Reactions
        if (element.reactions) {
           for (const reaction of element.reactions) {
              if (reaction.targetElementId === nEl.id) {
                 if (Math.random() < reaction.chance) {
                    const transIdx = this.elementList.findIndex(e => e.id === reaction.transformIntoId);
                    if (transIdx >= 0) this.nextGrid[idx] = transIdx;
                    
                    if (reaction.producesElementId) {
                       const prodIdx = this.elementList.findIndex(e => e.id === reaction.producesElementId);
                       if (prodIdx >= 0) this.nextGrid[nIdx] = prodIdx;
                    }
                 }
              }
           }
        }

        // Acidity: low acidity (sour/acid) can dissolve things
        if (element.acidity < 4 && nEl.category === 'mineral' && !nEl.isIndestructible) {
           if (Math.random() < 0.01) {
             this.nextGrid[nIdx] = 0; // Dissolve
           }
        }
      }
    }
    
    if (state === PhysicalState.POWDER) { 
       this.handleFalling(x, y, elIdx);
    } else if (state === PhysicalState.LIQUID) {
       this.handleLiquid(x, y, elIdx);
    } else if (state === PhysicalState.GAS) {
       this.handleGas(x, y, elIdx);
    }
    // SOLID does nothing (static)
  }

  private handleFalling(x: number, y: number, elIdx: number) {
    if (y >= this.height - 1) return;

    const below = (y + 1) * this.width + x;
    const belowLeft = (y + 1) * this.width + (x - 1);
    const belowRight = (y + 1) * this.width + (x + 1);

    if (this.grid[below] === 0) {
      this.movePixel(x, y, x, y + 1, elIdx);
    } else if (x > 0 && this.grid[belowLeft] === 0) {
      this.movePixel(x, y, x - 1, y + 1, elIdx);
    } else if (x < this.width - 1 && this.grid[belowRight] === 0) {
      this.movePixel(x, y, x + 1, y + 1, elIdx);
    }
  }

  private handleLiquid(x: number, y: number, elIdx: number) {
    if (y >= this.height - 1) return;

    const below = (y + 1) * this.width + x;
    
    // 1. Can fall straight down?
    if (this.grid[below] === 0) {
      this.movePixel(x, y, x, y + 1, elIdx);
      return;
    }

    // 2. Can fall diagonally?
    const dir = Math.random() > 0.5 ? 1 : -1;
    const belowSide = (y + 1) * this.width + (x + dir);
    if (x + dir >= 0 && x + dir < this.width && this.grid[belowSide] === 0) {
      this.movePixel(x, y, x + dir, y + 1, elIdx);
      return;
    }
    
    const belowOtherSide = (y + 1) * this.width + (x - dir);
    if (x - dir >= 0 && x - dir < this.width && this.grid[belowOtherSide] === 0) {
      this.movePixel(x, y, x - dir, y + 1, elIdx);
      return;
    }

    // 3. Lateral spread (High Fluidity) - Leveling out aggressively
    const spreadRange = 25; 
    let leftTarget = -1;
    let rightTarget = -1;

    for (let i = 1; i <= spreadRange; i++) {
        const lx = x - i;
        if (lx < 0) break;
        const targetIdx = y * this.width + lx;
        const belowTargetIdx = (y + 1) * this.width + lx;

        if (this.grid[targetIdx] === 0 && this.nextGrid[targetIdx] === 0) {
            leftTarget = lx;
            // Immediate priority if there is a hole below
            if (y < this.height - 1 && this.grid[belowTargetIdx] === 0) {
                break;
            }
        } else if (this.grid[targetIdx] !== 0) {
            // Cannot pass through other particles
            break;
        }
    }

    for (let i = 1; i <= spreadRange; i++) {
        const rx = x + i;
        if (rx >= this.width) break;
        const targetIdx = y * this.width + rx;
        const belowTargetIdx = (y + 1) * this.width + rx;

        if (this.grid[targetIdx] === 0 && this.nextGrid[targetIdx] === 0) {
            rightTarget = rx;
            if (y < this.height - 1 && this.grid[belowTargetIdx] === 0) {
                break;
            }
        } else if (this.grid[targetIdx] !== 0) {
            break;
        }
    }

    if (leftTarget !== -1 && rightTarget !== -1) {
        const targetX = Math.random() > 0.5 ? leftTarget : rightTarget;
        this.movePixel(x, y, targetX, y, elIdx);
    } else if (leftTarget !== -1) {
        this.movePixel(x, y, leftTarget, y, elIdx);
    } else if (rightTarget !== -1) {
        this.movePixel(x, y, rightTarget, y, elIdx);
    }
  }

  private handleGas(x: number, y: number, elIdx: number) {
    if (y <= 0) {
      this.setPixelToAir(x, y);
      return;
    }

    const above = (y - 1) * this.width + x;
    const dir = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    const targetX = x + dir;
    const targetIdx = (y - 1) * this.width + targetX;

    if (targetX >= 0 && targetX < this.width && this.grid[targetIdx] === 0) {
      this.movePixel(x, y, targetX, y - 1, elIdx);
    }
  }

  private movePixel(oldX: number, oldY: number, newX: number, newY: number, elIdx: number) {
    const oldIdx = oldY * this.width + oldX;
    const newIdx = newY * this.width + newX;
    
    // Safety: check if the target has already been occupied or modified in this frame
    // If nextGrid[newIdx] is different from grid[newIdx], it means another particle 
    // already moved here or moved away from here.
    if (this.nextGrid[newIdx] !== this.grid[newIdx]) return;
    
    // Safety: check if the source hasn't already been moved from
    if (this.nextGrid[oldIdx] !== elIdx) return;

    const targetIdx = this.grid[newIdx];
    const targetEl = this.elementList[targetIdx];
    
    if (targetEl && targetEl.isIndestructible) return;

    // Contact decay / transformation
    const currentEl = this.elementList[elIdx];
    if (targetEl && targetEl.decaysIntoId && Math.random() < (targetEl.decayChance || 0)) {
       const decayIdx = this.elementList.findIndex(e => e.id === targetEl.decaysIntoId);
       if (decayIdx >= 0) {
         this.nextGrid[newIdx] = decayIdx;
       }
    }
    if (currentEl && currentEl.decaysIntoId && Math.random() < (currentEl.decayChance || 0)) {
        const decayIdx = this.elementList.findIndex(e => e.id === currentEl.decaysIntoId);
        if (decayIdx >= 0) {
          this.nextGrid[oldIdx] = decayIdx;
          // Continue move logic if it didn't just transform? 
          // Usually transformations stop movement for that frame.
        }
    }
    
    if (targetIdx !== 0 && targetEl) {
       if (currentEl.density > targetEl.density) {
          // Atomic Swap
          this.nextGrid[oldIdx] = targetIdx;
          this.nextGrid[newIdx] = elIdx;
          
          this.nextTempGrid[oldIdx] = this.tempGrid[newIdx];
          this.nextTempGrid[newIdx] = this.tempGrid[oldIdx];

          this.nextLifeGrid[oldIdx] = this.lifeGrid[newIdx];
          this.nextLifeGrid[newIdx] = this.lifeGrid[oldIdx];

          this.nextCtypeGrid[oldIdx] = this.ctypeGrid[newIdx];
          this.nextCtypeGrid[newIdx] = this.ctypeGrid[oldIdx];
       }
    } else {
       // Standard move to empty space
       this.nextGrid[oldIdx] = 0;
       this.nextGrid[newIdx] = elIdx;

       this.nextTempGrid[newIdx] = this.tempGrid[oldIdx];
       this.nextTempGrid[oldIdx] = 293; 

       this.nextLifeGrid[newIdx] = this.lifeGrid[oldIdx];
       this.nextLifeGrid[oldIdx] = 0;

       this.nextCtypeGrid[newIdx] = this.ctypeGrid[oldIdx];
       this.nextCtypeGrid[oldIdx] = 0;
    }
  }

  private setPixelToAir(x: number, y: number) {
    this.nextGrid[y * this.width + x] = 0;
  }

  public render(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.grid.length; i++) {
        const elIdx = this.grid[i];
        const color = this.elementList[elIdx].color;
        const life = this.lifeGrid[i];
        const temp = this.tempGrid[i];
        
        let finalColor = color;
        
        // 1. Temperature-based color shifts
        if (temp < 273.15) {
           // Cold: Shift towards blue
           const intensity = Math.min((273.15 - temp) / 273.15, 0.5);
           finalColor = this.lerpColor(finalColor, '#0066FF', intensity);
        } else if (temp > 350 && temp <= 800) {
           // Warm: Shift towards red (not yet glowing)
           const intensity = Math.min((temp - 350) / 450, 0.4);
           finalColor = this.lerpColor(finalColor, '#FF3300', intensity);
        } else if (temp > 800) {
           // Glowing hot
           const glowColor = this.getGlowColor(temp);
           const intensity = Math.min((temp - 800) / 1500, 1.0);
           finalColor = this.lerpColor(finalColor, glowColor, intensity);
        }

        // 2. Spark overlay
        if (life > 0) {
          // Sparks are bright yellow-white
          const sparkColor = '#FFFFCC';
          finalColor = this.lerpColor(finalColor, sparkColor, life / 4);
        }

        this.buffer[i] = this.hexToUint32(finalColor);
    }
    ctx.putImageData(this.imageData, 0, 0);
  }

  private getGlowColor(tempK: number): string {
    // Simplified Planckian locus approximation
    if (tempK < 800) return '#000000';
    
    // Very hot: shift from deep red to bright white
    if (tempK < 1500) {
      // Reddish
      const r = 255;
      const g = Math.floor((tempK - 800) / 700 * 100);
      return `#${(r << 16 | g << 8 | 0).toString(16).padStart(6, '0')}`;
    } else if (tempK < 2500) {
      // Orange to yellow
      const r = 255;
      const g = 100 + Math.floor((tempK - 1500) / 1000 * 155);
      const b = Math.floor((tempK - 1500) / 1000 * 100);
      return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
    } else {
      // Yellow to white
      const r = 255;
      const g = 255;
      const b = 100 + Math.min(Math.floor((tempK - 2500) / 1000 * 155), 155);
      return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
    }
  }

  private lerpColor(a: string, b: string, amount: number): string {
    const r1 = parseInt(a.slice(1, 3), 16);
    const g1 = parseInt(a.slice(3, 5), 16);
    const b1 = parseInt(a.slice(5, 7), 16);
    const r2 = parseInt(b.slice(1, 3), 16);
    const g2 = parseInt(b.slice(3, 5), 16);
    const b2 = parseInt(b.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * amount);
    const g = Math.round(g1 + (g2 - g1) * amount);
    const b_ = Math.round(b1 + (b2 - b1) * amount);
    return `#${(r << 16 | g << 8 | b_).toString(16).padStart(6, '0')}`;
  }

  private hexToUint32(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // ABGR format for little-endian Uint32Array
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }

  public getSnapshot() {
    return {
      grid: new Uint32Array(this.grid),
      tempGrid: new Float32Array(this.tempGrid),
      pressureGrid: new Float32Array(this.pressureGrid),
      lifeGrid: new Uint8Array(this.lifeGrid),
      ctypeGrid: new Uint32Array(this.ctypeGrid)
    };
  }

  public restoreSnapshot(snapshot: any) {
    if (!snapshot) return;
    this.grid.set(snapshot.grid);
    this.tempGrid.set(snapshot.tempGrid);
    this.pressureGrid.set(snapshot.pressureGrid);
    this.lifeGrid.set(snapshot.lifeGrid);
    this.ctypeGrid.set(snapshot.ctypeGrid);
    this.nextGrid.set(this.grid);
    this.nextTempGrid.set(this.tempGrid);
    this.nextPressureGrid.set(this.pressureGrid);
    this.nextLifeGrid.set(this.lifeGrid);
    this.nextCtypeGrid.set(this.ctypeGrid);
  }
}
