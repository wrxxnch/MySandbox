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

  public setPixel(x: number, y: number, elementId: string) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const index = y * this.width + x;
    
    if (elementId === 'electricity') {
       const elIdx = this.grid[index];
       const el = this.elementList[elIdx];
       if (el && el.conductivity > 0) {
         this.lifeGrid[index] = 4;
       }
       return;
    }

    const elIndex = this.elementList.findIndex(e => e.id === elementId);
    this.grid[index] = elIndex >= 0 ? elIndex : 0;
    
    // Add initial charge for dedicated sources
    if (elementId === 'positive') {
      this.lifeGrid[index] = 4;
    } else if (elementId === 'negative') {
       // Negative could be a different type of spark in TPT, but here we'll treat it as a source too
       this.lifeGrid[index] = 4;
    }
  }

  public step() {
    // Copy current state to nextGrid
    this.nextGrid.set(this.grid);
    this.nextTempGrid.set(this.tempGrid);
    this.nextLifeGrid.fill(0);

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

           // Conduction at Life 3
           if (life === 3 && el && el.conductivity > 0) {
              const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
              for (const [dx, dy] of neighbors) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
                
                const nIdx = ny * this.width + nx;
                const nEl = this.elementList[this.grid[nIdx]];
                // Only spark if the neighbor is conductive and has life 0
                if (nEl && nEl.conductivity > 0 && this.lifeGrid[nIdx] === 0) {
                   this.nextLifeGrid[nIdx] = 4;
                }
              }
           }
        }

        // Heat propagation (keep it simple)
        const temp = this.tempGrid[idx];
        if (temp !== 293) {
           const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
           for (const [dx, dy] of neighbors) {
             const nx = x + dx;
             const ny = y + dy;
             if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
             const nIdx = ny * this.width + nx;
             const tempDiff = temp - this.tempGrid[nIdx];
             if (Math.abs(tempDiff) > 0.1) {
                this.nextTempGrid[nIdx] += tempDiff * 0.05;
                this.nextTempGrid[idx] -= tempDiff * 0.05;
             }
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
       const vaporIdx = this.elementList.findIndex(e => e.id === element.vaporElementId);
       if (vaporIdx >= 0) {
          this.nextGrid[idx] = vaporIdx;
          return;
       }
    }
    if (element.freezingPoint > 0 && currentTemp <= element.freezingPoint && element.congealElementId) {
       const congealIdx = this.elementList.findIndex(e => e.id === element.congealElementId);
       if (congealIdx >= 0) {
          this.nextGrid[idx] = congealIdx;
          return;
       }
    }

    const state = element.state;
    
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

    // 3. Lateral spread (Full pressure)
    // Scan left and right to find the nearest opening
    const spreadRange = 5; // How far it can check per frame
    let targetX = -1;
    
    for (let i = 1; i <= spreadRange; i++) {
      const leftX = x - i;
      const rightX = x + i;
      
      // We check nextGrid mainly because a spot might have been emptied this frame.
      // But standard checking grid is safer for finding "available room"
      const leftValid = leftX >= 0 && this.grid[y * this.width + leftX] === 0 && this.nextGrid[y * this.width + leftX] === 0;
      const rightValid = rightX < this.width && this.grid[y * this.width + rightX] === 0 && this.nextGrid[y * this.width + rightX] === 0;

      if (leftValid && rightValid) {
        targetX = Math.random() > 0.5 ? leftX : rightX;
        break;
      } else if (leftValid) {
        targetX = leftX;
        break;
      } else if (rightValid) {
        targetX = rightX;
        break;
      }
    }

    if (targetX !== -1) {
      this.movePixel(x, y, targetX, y, elIdx);
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

    const currentEl = this.elementList[elIdx];
    
    if (targetIdx !== 0 && targetEl) {
       if (currentEl.density > targetEl.density) {
          // Atomic Swap
          this.nextGrid[oldIdx] = targetIdx;
          this.nextGrid[newIdx] = elIdx;
          
          this.nextTempGrid[oldIdx] = this.tempGrid[newIdx];
          this.nextTempGrid[newIdx] = this.tempGrid[oldIdx];

          this.nextLifeGrid[oldIdx] = this.lifeGrid[newIdx];
          this.nextLifeGrid[newIdx] = this.lifeGrid[oldIdx];
       }
    } else {
       // Standard move to empty space
       this.nextGrid[oldIdx] = 0;
       this.nextGrid[newIdx] = elIdx;

       this.nextTempGrid[newIdx] = this.tempGrid[oldIdx];
       this.nextTempGrid[oldIdx] = 293; 

       this.nextLifeGrid[newIdx] = this.lifeGrid[oldIdx];
       this.nextLifeGrid[oldIdx] = 0;
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
        
        let finalColor = color;
        if (life > 0) {
          // Sparks are bright yellow-white
          const sparkColor = '#FFFFCC';
          finalColor = this.lerpColor(color, sparkColor, life / 4);
        }

        this.buffer[i] = this.hexToUint32(finalColor);
    }
    ctx.putImageData(this.imageData, 0, 0);
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
}
