import { GRID_WIDTH, GRID_HEIGHT, ElementProperties, PhysicalState, Particle, ViewMode } from '../types';
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
  public decoGrid: Uint32Array;
  public showDecoration: boolean = true;
  public elements: Map<string, ElementProperties> = new Map();
  public elementList: ElementProperties[] = [];
  public viewMode: ViewMode = ViewMode.NORMAL;
  public ambientHeatEnabled: boolean = true;
  
  // Buffers for visualization
  public imageData: ImageData;
  private buffer: Uint32Array;

  public particles: Particle[] = [];
  private forceMatrix: number[][] = [];
  public particleColors = ['#f87171', '#4ade80', '#60a5fa', '#fbbf24', '#a78bfa', '#22d3ee'];
  private friction = 0.95;
  private interactionRadius = 80;

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
    this.decoGrid = new Uint32Array(this.width * this.height);
    this.imageData = new ImageData(this.width, this.height);
    this.buffer = new Uint32Array(this.imageData.data.buffer);
    
    this.randomizeParticleForces(Math.random().toString());
    this.loadElements(BASE_ELEMENTS);
  }

  public randomizeParticleForces(seed: string) {
    const seededRandom = (s: string) => {
      let x = 0;
      for (let i = 0; i < s.length; i++) x = (x << 5) - x + s.charCodeAt(i);
      return () => {
        x = Math.sin(x++) * 10000;
        return x - Math.floor(x);
      };
    };
    const rng = seededRandom(seed);
    this.forceMatrix = [];
    for (let i = 0; i < this.particleColors.length; i++) {
        const row = [];
        for (let j = 0; j < this.particleColors.length; j++) {
            row.push(rng() * 2 - 1);
        }
        this.forceMatrix.push(row);
    }
  }

  public setFriction(f: number) { this.friction = f; }
  public setInteractionRadius(r: number) { this.interactionRadius = r; }

  public getSnapshot() {
    return {
      grid: new Uint32Array(this.grid),
      tempGrid: new Float32Array(this.tempGrid),
      lifeGrid: new Uint8Array(this.lifeGrid),
      pressureGrid: new Float32Array(this.pressureGrid),
      ctypeGrid: new Uint32Array(this.ctypeGrid),
      decoGrid: new Uint32Array(this.decoGrid),
      particles: JSON.parse(JSON.stringify(this.particles))
    };
  }

  public restoreSnapshot(snapshot: any) {
    this.grid.set(snapshot.grid);
    this.tempGrid.set(snapshot.tempGrid);
    this.lifeGrid.set(snapshot.lifeGrid);
    this.pressureGrid.set(snapshot.pressureGrid);
    this.ctypeGrid.set(snapshot.ctypeGrid);
    if (snapshot.decoGrid) this.decoGrid.set(snapshot.decoGrid);
    this.particles = snapshot.particles || [];
    this.nextGrid.set(this.grid);
    this.nextTempGrid.set(this.tempGrid);
    this.nextLifeGrid.set(this.lifeGrid);
    this.nextPressureGrid.set(this.pressureGrid);
    this.nextCtypeGrid.set(this.ctypeGrid);
  }

  public clear() {
    this.grid.fill(0);
    this.nextGrid.fill(0);
    this.chargeGrid.fill(0);
    this.nextChargeGrid.fill(0);
    this.lifeGrid.fill(0);
    this.nextLifeGrid.fill(0);
    this.pressureGrid.fill(0);
    this.nextPressureGrid.fill(0);
    this.ctypeGrid.fill(0);
    this.nextCtypeGrid.fill(0);
    this.tempGrid.fill(293.15);
    this.nextTempGrid.fill(293.15);
    this.decoGrid.fill(0);
    this.particles = [];
  }

  public loadElements(elements: ElementProperties[]) {
    this.elementList = [...elements];
    this.elements.clear();
    elements.forEach(el => this.elements.set(el.id, el));
  }

  public setPixel(x: number, y: number, elementId: string, options: { overwrite?: boolean, temp?: number, ctype?: string, ctypeIdNum?: number } = {}) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const index = y * this.width + x;
    
    const existingIdx = this.grid[index];
    const isTool = ['heat', 'cold', 'wind', 'vccm', 'prop', 'electricity', 'sprk'].includes(elementId);
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
    if (elementId === 'vccm') {
       this.pressureGrid[index] -= 15.0;
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

    if (elementId === 'electricity' || elementId === 'sprk') {
       const elIdx = this.grid[index];
       const el = this.elementList[elIdx];
       if (el && el.conductivity > 0) {
         this.lifeGrid[index] = 4;
       } else if (elementId === 'sprk' && elIdx === 0) {
         // Allow placing spark in air too, but as a temporary pixel (since it has decay)
         const sprkIdx = this.elementList.findIndex(e => e.id === 'sprk');
         if (sprkIdx >= 0) {
            this.grid[index] = sprkIdx;
            this.lifeGrid[index] = 4;
            this.tempGrid[index] = 293.15;
         }
       }
       return;
    }

    const elIndex = this.elementList.findIndex(e => e.id === elementId);
    if (elIndex < 0 && elementId !== 'air') return;
    
    this.grid[index] = elIndex >= 0 ? elIndex : 0;
    
    if (options.temp !== undefined) {
      this.tempGrid[index] = options.temp;
    } else if (elIndex >= 0) {
      const el = this.elementList[elIndex];
      if (el.baseTemperature !== undefined) {
        this.tempGrid[index] = el.baseTemperature;
      } else {
        // Fallbacks for common elements without baseTemperature
        if (el.id === 'fire') this.tempGrid[index] = 673.15;
        else if (el.id === 'lava') this.tempGrid[index] = 1473.15;
        else if (el.id === 'steam' || el.name.toLowerCase().includes('vapor')) this.tempGrid[index] = 373.15;
        else this.tempGrid[index] = 293.15;
      }
    }
    
    if (options.ctype) {
      const ctypeIdx = this.elementList.findIndex(e => e.id === options.ctype);
      if (ctypeIdx >= 0) {
        this.ctypeGrid[index] = ctypeIdx;
      }
    } else if (options.ctypeIdNum !== undefined) {
      this.ctypeGrid[index] = Math.floor(options.ctypeIdNum);
    }

    // Add initial charge for dedicated sources
    const el = elIndex >= 0 ? this.elementList[elIndex] : null;
    if ((el && el.isSource) || elementId === 'sprk') {
      this.lifeGrid[index] = 4;
    } else if (elementId === 'fire') {
      this.lifeGrid[index] = 80 + Math.floor(Math.random() * 40); // Initial fire life
    }
  }

  public setDeco(x: number, y: number, color: string | null) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const index = y * this.width + x;
    if (color === null) {
      this.decoGrid[index] = 0;
    } else {
      this.decoGrid[index] = this.hexToUint32(color);
    }
  }

  public step() {
    // Copy current state to next buffers for persistent properties
    this.nextGrid.set(this.grid);
    this.nextTempGrid.set(this.tempGrid);
    this.nextCtypeGrid.set(this.ctypeGrid);
    this.nextPressureGrid.set(this.pressureGrid);
    this.nextLifeGrid.fill(0);

    // 1. Spark / Electricity Propagation (TPT-like Life Cycle)
    const sparkedWifiChannels = new Set<number>();

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        const life = this.lifeGrid[idx];
        const elIdx = this.grid[idx];
        const el = this.elementList[elIdx];

        if (el && el.isSource) {
           this.nextLifeGrid[idx] = 4;
        } else if (life > 0) {
           // Decay
           this.nextLifeGrid[idx] = life - 1;
        }

        // Wi-Fi Transmission: If sparked and at transmission state (life 3)
        if (el && el.id === 'wifi' && life === 3) {
           sparkedWifiChannels.add(this.ctypeGrid[idx]);
        }

        // Conduction at Life 3 or 4 (sources always spark)
        // Metal elements shouldn't be sparked by fire/embers/non-source materials
        if (el && (life === 3 || (life === 4 && el.isSource)) && el.conductivity > 0 && el.id !== 'fire' && el.id !== 'embr' && el.id !== 'lava') {
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

        // Pressure Diffusion (Simplified)
        let pAvg = this.pressureGrid[idx];
        const pNeighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of pNeighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            pAvg += this.pressureGrid[ny * this.width + nx];
          }
        }
        this.nextPressureGrid[idx] = (pAvg / 5) * 0.98; // Smooth and decay

        // Heat propagation based on thermalConductivity
        const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const selfTC = el?.thermalConductivity ?? 0.02; // Air and tools have lower TC
        
        // Dissipation to environment (Ambient return)
        // Sensors don't lose temp to environment
        if (this.ambientHeatEnabled && el && el.category !== 'sensors') {
          const ROOM_TEMP = 293.15;
          const dissipationRate = 0.005; // Global cooling/warming factor to return to normal
          this.nextTempGrid[idx] += (ROOM_TEMP - this.tempGrid[idx]) * dissipationRate;
        }

        if (selfTC > 0) {
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
            const nIdx = ny * this.width + nx;
            
            // If ambient heat is disabled, don't transfer to/from air (id 0)
            if (!this.ambientHeatEnabled && (this.grid[idx] === 0 || this.grid[nIdx] === 0)) continue;

            const nEl = this.elementList[this.grid[nIdx]];
            const otherTC = nEl?.thermalConductivity ?? 0.02;
            
            if (otherTC > 0) {
              const thermalDiff = this.tempGrid[idx] - this.tempGrid[nIdx];
              // Heat conduction formula: rate * difference
              // Divided by 4 because we check 4 neighbors
              const transferRate = (selfTC + otherTC) * 0.125; 
              
              if (Math.abs(thermalDiff) > 0.01) {
                this.nextTempGrid[idx] -= thermalDiff * transferRate;
              }
            }
          }
        }
      }
    }

    // Wi-Fi Reception Pass: Spark all WiFi on active channels
    if (sparkedWifiChannels.size > 0) {
      for (let i = 0; i < this.grid.length; i++) {
        const elIdx = this.grid[i];
        const el = this.elementList[elIdx];
        if (el && el.id === 'wifi') {
           const channel = this.ctypeGrid[i];
           if (sparkedWifiChannels.has(channel) && this.lifeGrid[i] === 0) {
              this.nextLifeGrid[i] = 4;
           }
        }
      }
    }

    // 2. Physics logic
    // We work from current life/temp/etc into next buffers
    for (let y = this.height - 1; y >= 0; y--) {
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x;
        const elIdx = this.grid[index];
        if (elIdx === 0) continue; // Air

        const element = this.elementList[elIdx];
        this.updatePixel(x, y, element, elIdx);
      }
    }

    // Swap all grids
    this.swapBuffers();

    // 3. Particle Life update
    this.updateParticles();
  }

  private updateParticles() {
    for (let i = 0; i < this.particles.length; i++) {
        let fx = 0;
        let fy = 0;
        const a = this.particles[i];

        // 1. Pressure Gradient Force
        const px = Math.floor(a.x);
        const py = Math.floor(a.y);
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
            const idx = py * this.width + px;
            const p = this.pressureGrid[idx];
            if (Math.abs(p) > 0.1) {
                // Calculate local gradient
                const nbs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                let gradX = 0;
                let gradY = 0;
                for (const [dx, dy] of nbs) {
                    const nx = px + dx;
                    const ny = py + dy;
                    if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                        const np = this.pressureGrid[ny * this.width + nx];
                        gradX += dx * (p - np);
                        gradY += dy * (p - np);
                    }
                }
                // Apply pressure force (push away from high pressure)
                a.vx += gradX * 0.05;
                a.vy += gradY * 0.05;
            }
        }

        // 2. Particle Interaction Forces
        for (let j = 0; j < this.particles.length; j++) {
            if (i === j) continue;
            const b = this.particles[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            if (d > 0 && d < this.interactionRadius) {
                const f = this.forceMatrix[a.type][b.type];
                // Distance-based force logic
                // Simple version: attraction/repulsion
                // Normalized force
                const force = (1 / d) * f;
                fx += force * dx;
                fy += force * dy;

                // Repulsion at very close range
                if (d < 10) {
                   const rForce = (10 - d) * 0.5;
                   fx += (dx/d) * rForce;
                   fy += (dy/d) * rForce;
                }
            }
        }

        a.vx = (a.vx + fx) * this.friction;
        a.vy = (a.vy + fy) * this.friction;
        a.x += a.vx;
        a.y += a.vy;

        // Bounce/Wrap boundaries
        if (a.x <= 0 || a.x >= this.width) a.vx *= -1;
        if (a.y <= 0 || a.y >= this.height) a.vy *= -1;
        a.x = Math.max(0, Math.min(this.width, a.x));
        a.y = Math.max(0, Math.min(this.height, a.y));
    }
  }

  public spawnParticle(x: number, y: number, type: number) {
    if (this.particles.length > 3000) return; // Cap for performance
    this.particles.push({
        x, y,
        vx: 0, vy: 0,
        type: type % this.particleColors.length,
        color: this.particleColors[type % this.particleColors.length]
    });
  }

  private swapBuffers() {
    let tmp;
    tmp = this.grid; this.grid = this.nextGrid; this.nextGrid = tmp;
    tmp = this.lifeGrid; this.lifeGrid = this.nextLifeGrid; this.nextLifeGrid = tmp;
    tmp = this.tempGrid; this.tempGrid = this.nextTempGrid; this.nextTempGrid = tmp;
    tmp = this.pressureGrid; this.pressureGrid = this.nextPressureGrid; this.nextPressureGrid = tmp;
    tmp = this.ctypeGrid; this.ctypeGrid = this.nextCtypeGrid; this.nextCtypeGrid = tmp;
  }

  private updatePixel(x: number, y: number, element: ElementProperties, elIdx: number) {
    const idx = y * this.width + x;
    const currentTemp = this.tempGrid[idx];

    // Special Flags logic
    if (element.isSource) {
      this.nextLifeGrid[idx] = 4; // Constant electricity
    }
    
    if (element.isRadiant) {
       // Radiate heat to neighbors
       const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
       for (const [dx, dy] of neighbors) {
         const nx = x + dx; const ny = y + dy;
         if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
           const nIdx = ny * this.width + nx;
           this.nextTempGrid[nIdx] = Math.min(this.nextTempGrid[nIdx] + 5, 2000);
         }
       }
    }

    // State Transitions
    // Hysteresis: add a larger buffer to prevent rapid oscillation
    const boilThreshold = element.boilingPoint + 5.0;
    const freezeThreshold = element.freezingPoint - 5.0;

    if (element.boilingPoint > 0 && currentTemp >= boilThreshold && element.vaporElementId) {
       let targetIdx = this.elementList.findIndex(e => e.id === element.vaporElementId);
       
       // ctype memory: if we have ctype, it might be the preferred vapor (or liquid we came from)
       if (this.ctypeGrid[idx] !== 0) {
          const ctypeIdx = this.ctypeGrid[idx];
          const ctypeEl = this.elementList[ctypeIdx];
          // If we came FROM a gas and are boiling BACK into it, use that specific gas
          if (ctypeEl && ctypeEl.state === PhysicalState.GAS) {
            targetIdx = ctypeIdx;
            this.nextCtypeGrid[idx] = 0; // Clear memory as we used it
          } else {
            // Otherwise, we are turning into vapor, so remember our current liquid state
            this.nextCtypeGrid[idx] = elIdx;
          }
       } else {
          // No ctype, so remember current state
          this.nextCtypeGrid[idx] = elIdx;
       }

       if (targetIdx >= 0) {
          this.nextGrid[idx] = targetIdx;
          this.nextTempGrid[idx] = currentTemp + 5.0; // Moderate kick up
          return;
       }
    }

    if (element.freezingPoint > 0 && currentTemp <= freezeThreshold && element.congealElementId) {
       let targetIdx = this.elementList.findIndex(e => e.id === element.congealElementId);
       
       // ctype memory: if we have ctype, it might be the preferred liquid (or solid we came from)
       if (this.ctypeGrid[idx] !== 0) {
          const ctypeIdx = this.ctypeGrid[idx];
          const ctypeEl = this.elementList[ctypeIdx];
          // If we came FROM a liquid/solid and are cooling BACK into it, use that specific one
          if (ctypeEl && (ctypeEl.state === PhysicalState.LIQUID || ctypeEl.state === PhysicalState.SOLID)) {
            targetIdx = ctypeIdx;
            this.nextCtypeGrid[idx] = 0; // Clear memory
          } else {
            // Remember current state (gas) when turning into liquid
            this.nextCtypeGrid[idx] = elIdx;
          }
       } else {
          // No ctype, remember current state
          this.nextCtypeGrid[idx] = elIdx;
       }

       if (targetIdx >= 0) {
          this.nextGrid[idx] = targetIdx;
          this.nextTempGrid[idx] = currentTemp - 5.0; // Moderate kick down
          return;
       }
    }

    const state = element.state;
    const p = this.pressureGrid[idx];

    // Pressure movement (Push from high pressure / Pull into vacuum)
    if (Math.abs(p) > 0.2 && state !== PhysicalState.SOLID) {
        const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        let maxGrad = 0;
        let pTarget = -1;
        
        for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
            const nIdx = ny * this.width + nx;
            const nP = this.pressureGrid[nIdx];
            
            // Pressure gradient: move from high P to low P
            const gradient = p - nP;
            if (gradient > maxGrad) {
                const targetElIdx = this.grid[nIdx];
                const targetEl = this.elementList[targetElIdx];
                // Can move into air OR something less dense
                if (targetElIdx === 0 || (targetEl && targetEl.density < element.density)) {
                   maxGrad = gradient;
                   pTarget = nIdx;
                }
            }
        }
        
        if (pTarget !== -1) {
            const moveChance = Math.min(maxGrad * 0.5, 1.0);
            if (Math.random() < moveChance) {
                const tx = pTarget % this.width;
                const ty = Math.floor(pTarget / this.width);
                this.movePixel(x, y, tx, ty, elIdx);
                return;
            }
        }
    }

    // CLONE logic
    if (element.id === 'clne') {
      let ctype = this.ctypeGrid[idx];
      if (ctype === 0 && !element.isIndestructible) { // Usually special elements are indestructible, but let's use a new flag if needed
        // Learn from neighbors
        const nbs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of nbs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            const nIdx = ny * this.width + nx;
            const nElIdx = this.grid[nIdx];
            if (nElIdx !== 0 && this.elementList[nElIdx].id !== 'clne') {
              this.nextCtypeGrid[idx] = nElIdx;
              ctype = nElIdx;
              break;
            }
          }
        }
      }

      if (ctype !== 0) {
        const nbs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of nbs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            const nIdx = ny * this.width + nx;
            if (this.grid[nIdx] === 0 && this.nextGrid[nIdx] === 0) {
              this.nextGrid[nIdx] = ctype;
              this.nextTempGrid[nIdx] = this.tempGrid[idx];
            }
          }
        }
      }
      return; // Clone is static otherwise
    }

    // FIRE special logic
    if (element.id === 'fire') {
      // this.nextPressureGrid[idx] += 2.0; // Fire creates pressure
      
      const fireLife = this.lifeGrid[idx];
      if (fireLife > 0) {
        this.nextLifeGrid[idx] = fireLife - 1;
      }

      if (fireLife <= 1) {
        const smkeIdx = this.elementList.findIndex(e => e.id === 'smke');
        if (smkeIdx >= 0) {
          this.nextGrid[idx] = smkeIdx;
          this.nextLifeGrid[idx] = 20 + Math.floor(Math.random() * 30); // Smoke has its own life/decay
        } else {
          this.nextGrid[idx] = 0;
        }
        return;
      }
      this.nextTempGrid[idx] = Math.min(this.nextTempGrid[idx] + 30, 2500);
    }
    
    // Sensor detection (Linking Temp to Pressure & Energy)
    if (element.category === 'sensors') {
       const psi = (currentTemp - 273.15); // C to PSI mapping as requested
       this.nextPressureGrid[idx] = psi;
       
       const thresholdK = this.ctypeGrid[idx];
       if (thresholdK > 0 && currentTemp >= thresholdK) {
          this.nextLifeGrid[idx] = 4; // Generate Energy
       }
    }
    
    // Explosion & Combustion logic
    if (element.isExplosive || element.flammability > 0) {
      let exploded = false;
      const ignitionTemp = element.isExplosive ? 450 : 500;
      if (currentTemp > ignitionTemp) exploded = true;
      
      if (!exploded) {
        const nbs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of nbs) {
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            const nElIdx = this.grid[ny * this.width + nx];
            const nEl = this.elementList[nElIdx];
            if (nEl && (nEl.id === 'fire' || nEl.id === 'sprk' || nEl.id === 'embr' || nEl.id === 'lava')) {
              exploded = true;
              break;
            }
          }
        }
      }

      if (exploded) {
        if (element.isExplosive) {
           let radius = 6;
           let fireAmount = 0.8;
           let sparkId: string | null = null;
           
           if (element.id === 'c4') { 
              radius = 12; 
              fireAmount = 0.7; 
           } else if (element.id === 'tnt') { 
              radius = 10; 
              fireAmount = 0.65; 
              sparkId = 'embr'; 
           } else if (element.id === 'gun') { 
              radius = 5; 
              fireAmount = 0.9; 
           } else if (element.id === 'rbi_s' || element.id === 'rbi_l') { 
              radius = 8; 
              fireAmount = 0.8; 
           } else if (element.id === 'nitr') { 
              radius = 7; 
              fireAmount = 0.9; 
           }
           
           this.triggerExplosion(x, y, radius, fireAmount, sparkId);
           return;
        } else {
           if (Math.random() < element.flammability * 0.1) {
              const fireIdx = this.elementList.findIndex(e => e.id === 'fire');
              const embrIdx = this.elementList.findIndex(e => e.id === 'embr');
              
              if (fireIdx >= 0) {
                  // If it's a solid/powder, it might leave an ember
                  if ((element.state === PhysicalState.SOLID || element.state === PhysicalState.POWDER) && Math.random() < 0.3 && embrIdx >= 0) {
                    this.nextGrid[idx] = embrIdx;
                    this.nextLifeGrid[idx] = 40 + Math.floor(Math.random() * 40);
                  } else {
                    this.nextGrid[idx] = fireIdx;
                    this.nextLifeGrid[idx] = 80 + Math.floor(Math.random() * 40);
                  }
                  this.nextTempGrid[idx] += 100;
                  return;
              }
           }
        }
      }
    }

    // Ember special logic (Powder spark)
    if (element.id === 'embr') {
       const life = this.lifeGrid[idx];
       if (life > 0) {
         this.nextLifeGrid[idx] = life - 1;
       } else if (Math.random() < 0.05) {
         // Natural decay if no life set
         const targetElIdx = this.elementList.findIndex(e => e.id === element.decaysIntoId);
         if (targetElIdx >= 0) {
           this.nextGrid[idx] = targetElIdx;
           return;
         }
       }
    }

    // Smoke logic
    if (element.id === 'smke') {
       const life = this.lifeGrid[idx];
       if (life > 0) {
         this.nextLifeGrid[idx] = life - 1;
       } else {
         // Natural decay
         if (Math.random() < 0.02) {
           this.nextGrid[idx] = 0;
           return;
         }
       }
    }

    // Decay logic
    if (element.id !== 'smke' && element.id !== 'embr' && element.decaysIntoId && Math.random() < (element.decayChance || 0)) {
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
              const isMatch = (reaction.targetElementId === nEl.id);
              const finalMatch = reaction.isExclude ? !isMatch : isMatch;

              if (finalMatch) {
                 // Check Required Acidity
                 if (reaction.requiredAcidity !== undefined && Math.abs(nEl.acidity - reaction.requiredAcidity) > 0.1) continue;

                 // Check Temperature Thresholds
                 if (reaction.minTemp !== undefined && currentTemp < reaction.minTemp) continue;
                 if (reaction.maxTemp !== undefined && currentTemp > reaction.maxTemp) continue;

                 // Check Pressure Thresholds
                 if (reaction.minPressure !== undefined && p < reaction.minPressure) continue;
                 if (reaction.maxPressure !== undefined && p > reaction.maxPressure) continue;

                 if (Math.random() < reaction.chance) {
                    const transIdx = this.elementList.findIndex(e => e.id === reaction.transformIntoId);
                    if (transIdx >= 0) this.nextGrid[idx] = transIdx;
                    
                    if (reaction.producesElementId) {
                       const prodIdx = this.elementList.findIndex(e => e.id === reaction.producesElementId);
                       if (prodIdx >= 0) this.nextGrid[nIdx] = prodIdx;
                    }

                    if (reaction.extraSpawnIds && reaction.extraSpawnIds.length > 0) {
                       const spawnNbs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
                       // Shuffle neighbors
                       for (let i = spawnNbs.length - 1; i > 0; i--) {
                           const j = Math.floor(Math.random() * (i + 1));
                           [spawnNbs[i], spawnNbs[j]] = [spawnNbs[j], spawnNbs[i]];
                       }
                       
                       let currentSpawnIdx = 0;
                       for (const [sdx, sdy] of spawnNbs) {
                          if (currentSpawnIdx >= reaction.extraSpawnIds.length) break;
                          const sx = x + sdx;
                          const sy = y + sdy;
                          if (sx >= 0 && sx < this.width && sy >= 0 && sy < this.height) {
                             const sIdx = sy * this.width + sx;
                             if (this.grid[sIdx] === 0 && this.nextGrid[sIdx] === 0) {
                                const elId = reaction.extraSpawnIds[currentSpawnIdx];
                                const elIdx = this.elementList.findIndex(e => e.id === elId);
                                if (elIdx >= 0) {
                                   this.nextGrid[sIdx] = elIdx;
                                   currentSpawnIdx++;
                                }
                             }
                          }
                       }
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
    
    if (element.id === 'fire') {
       this.handleGas(x, y, elIdx);
    } else if (state === PhysicalState.POWDER) { 
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

    const el = this.elementList[elIdx];
    const below = (y + 1) * this.width + x;
    const belowLeft = (y + 1) * this.width + (x - 1);
    const belowRight = (y + 1) * this.width + (x + 1);

    if (this.grid[below] === 0) {
      this.movePixel(x, y, x, y + 1, elIdx);
    } else if (x > 0 && this.grid[belowLeft] === 0) {
      this.movePixel(x, y, x - 1, y + 1, elIdx);
    } else if (x < this.width - 1 && this.grid[belowRight] === 0) {
      this.movePixel(x, y, x + 1, y + 1, elIdx);
    } else if (Math.random() < 0.2) {
      // Density sinking through liquids/gases
      const targetElIdx = this.grid[below];
      const targetEl = this.elementList[targetElIdx];
      if (targetEl && targetEl.density < el.density && (targetEl.state === PhysicalState.LIQUID || targetEl.state === PhysicalState.GAS)) {
        this.swapPixels(x, y, x, y + 1);
      }
    }
  }

  private handleLiquid(x: number, y: number, elIdx: number) {
    const el = this.elementList[elIdx];
    const viscosity = el.viscosity || 0;
    
    // Viscosity chance: higher viscosity means less likely to move laterally/diagonally
    const canMove = Math.random() > (viscosity / 100);
    if (!canMove) return;

    const canFall = y < this.height - 1;
    const below = canFall ? (y + 1) * this.width + x : -1;
    
    // 1. Can fall straight down?
    if (canFall && this.grid[below] === 0) {
      this.movePixel(x, y, x, y + 1, elIdx);
      return;
    }

    // 2. Density sinking
    if (canFall) {
      const targetBelowIdx = this.grid[below];
      const targetBelow = this.elementList[targetBelowIdx];
      if (targetBelow && targetBelow.density < el.density && (targetBelow.state === PhysicalState.LIQUID || targetBelow.state === PhysicalState.GAS)) {
        this.swapPixels(x, y, x, y + 1);
        return;
      }
    }

    // 3. Can flow diagonally downwards or deep horizontal searching for gaps
    if (canFall) {
      const dir = Math.random() > 0.5 ? 1 : -1;
      const targets = [dir, -dir];
      for (const d of targets) {
        const tx = x + d;
        const ty = y + 1;
        if (tx >= 0 && tx < this.width) {
          const nIdx = ty * this.width + tx;
          if (this.grid[nIdx] === 0) {
            this.movePixel(x, y, tx, ty, elIdx);
            return;
          }
        }
      }
    }

    // 4. Horizontal Flow & Gap Filling
    // High viscosity slows spread. Low viscosity spreads fast to fill gaps.
    const hDir = Math.random() > 0.5 ? 1 : -1;
    const hRange = viscosity > 50 ? 1 : 3; // Spread further if low viscosity
    
    const hTargets = [hDir, -hDir];
    for(const d of hTargets) {
      for (let dist = 1; dist <= hRange; dist++) {
        const tx = x + d * dist;
        if (tx < 0 || tx >= this.width) break;
        
        const nIdx = y * this.width + tx;
        if (this.grid[nIdx] === 0) {
          this.movePixel(x, y, tx, y, elIdx);
          return;
        }
        
        // Lateral density swap
        const nEl = this.elementList[this.grid[nIdx]];
        if (nEl && nEl.state === PhysicalState.LIQUID && nEl.density < el.density) {
          if (Math.random() < 0.1 / dist) {
            this.swapPixels(x, y, tx, y);
            return;
          }
           break; // Stop horizontal search if blocked by liquid
        }
        
        if (nEl && nEl.state === PhysicalState.SOLID) break; // Blocked by solid
      }
    }
  }

  private handleGas(x: number, y: number, elIdx: number) {
    const el = this.elementList[elIdx];
    const density = el.density;
    
    // Limits
    if (y <= 0 && density < 0) {
      this.setPixelToAir(x, y);
      return;
    }
    if (y >= this.height - 1 && density > 0) {
       return; 
    }

    const side = Math.random() > 0.5 ? 1 : -1;
    const vert = Math.random() > 0.5 ? 1 : -1;
    
    // Support for multiple movements per frame for high buoyancy/weight (gases only)
    const absDensity = Math.abs(density);
    // Use floor of abs density as speed multiplier, min 1
    const moveIterations = Math.max(1, Math.min(8, Math.floor(absDensity)));
    
    for (let iter = 0; iter < moveIterations; iter++) {
      let targets: [number, number][] = [];
      
      if (density < 0) {
        // Buoyant: rises. Higher negative density = more aggressive rise.
        // Magnitude (absDensity) now also drives iteration count for speed.
        if (Math.random() < 0.85) {
          targets = [[0, -1], [side, -1], [-side, -1], [side, 0], [-side, 0]];
        } else {
          targets = [[side, 0], [-side, 0], [0, -1], [side, -1], [0, 1]];
        }
      } else if (density > 0) {
        // Heavy gas: falls. Higher density = more aggressive fall.
        if (Math.random() < 0.85) {
          targets = [[0, 1], [side, 1], [-side, 1], [side, 0], [-side, 0]];
        } else {
          targets = [[side, 0], [-side, 0], [0, 1], [side, 1], [0, -1]];
        }
      } else {
        // Density 0: TRUE random Brownian movement in all directions
        targets = [[0, -1], [0, 1], [1, 0], [-1, 0], [side, vert], [-side, -vert]];
        // Shuffle to ensure unbiased random walk
        for (let i = targets.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [targets[i], targets[j]] = [targets[j], targets[i]];
        }
      }

      let moved = false;
      for (const [dx, dy] of targets) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;
        
        const nIdx = ty * this.width + tx;
        const nElIdx = this.grid[nIdx];
        
        if (nElIdx === 0) {
          // Check if destination is also empty in nextGrid
          if (this.nextGrid[nIdx] === 0) {
             this.movePixel(x, y, tx, ty, elIdx);
             x = tx; y = ty; // Update current position if we were to loop
             moved = true;
             break;
          }
        } else {
          const nEl = this.elementList[nElIdx];
          if (nEl && (nEl.state === PhysicalState.LIQUID || nEl.state === PhysicalState.GAS)) {
             // Swap check: Always swap if I am lighter (lower density) and trying to go UP
             // OR if I am heavier (higher density) and trying to go DOWN
             const shouldSwap = (density < nEl.density && dy < 0) || (density > nEl.density && dy > 0);
             
             if (shouldSwap && Math.random() < 0.6) {
                this.swapPixels(x, y, tx, ty);
                x = tx; y = ty;
                moved = true;
                break;
             }
          }
        }
      }
      if (!moved) break;
    }
  }

  private swapPixels(x1: number, y1: number, x2: number, y2: number) {
    const idx1 = y1 * this.width + x1;
    const idx2 = y2 * this.width + x2;

    const el1 = this.grid[idx1];
    const el2 = this.grid[idx2];
    
    // Safety check: Don't swap if either pixel has already been modified in this step
    // or if the source pixel no longer matches its expected state (already moved)
    if (this.nextGrid[idx1] !== el1 || this.nextGrid[idx2] !== el2) return;
    
    this.nextGrid[idx1] = el2;
    this.nextGrid[idx2] = el1;

    // Swap related properties
    const temp1 = this.tempGrid[idx1];
    const temp2 = this.tempGrid[idx2];
    this.nextTempGrid[idx1] = temp2;
    this.nextTempGrid[idx2] = temp1;

    const life1 = this.lifeGrid[idx1];
    const life2 = this.lifeGrid[idx2];
    this.nextLifeGrid[idx1] = life2;
    this.nextLifeGrid[idx2] = life1;

    const ctype1 = this.ctypeGrid[idx1];
    const ctype2 = this.ctypeGrid[idx2];
    this.nextCtypeGrid[idx1] = ctype2;
    this.nextCtypeGrid[idx2] = ctype1;
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

    // --- Special Element Logic: VOID / ABSORB ---
    if (targetEl && (targetEl.id === 'void' || targetEl.id === 'absorb_wall')) {
      this.nextGrid[oldIdx] = 0; // Destroy the element trying to move in
      return;
    }
    
    if (targetEl && targetEl.isIndestructible) return;

    // Contact decay / transformation
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
        }
    }
    
    if (targetIdx !== 0 && targetEl) {
       const isGasRising = currentEl.state === PhysicalState.GAS && targetEl.state === PhysicalState.LIQUID;
       const shouldSwap = currentEl.density > targetEl.density || isGasRising;
       
       if (shouldSwap) {
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

  private triggerExplosion(x: number, y: number, radius: number, fireAmount: number, sparkId: string | null = null) {
     const fireIdx = this.elementList.findIndex(e => e.id === 'fire');
     const sparkIdx = sparkId ? this.elementList.findIndex(e => e.id === sparkId) : -1;
     
     for (let dy = -radius; dy <= radius; dy++) {
       for (let dx = -radius; dx <= radius; dx++) {
         const nx = x + dx;
         const ny = y + dy;
         if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
         
         const d2 = dx * dx + dy * dy;
         if (d2 <= radius * radius) {
           const idx = ny * this.width + nx;
           const elIdx = this.grid[idx];
           const el = this.elementList[elIdx];
           
           if (el && el.isIndestructible) continue;
           
           const dist = Math.sqrt(d2);
           const pFactor = (radius - dist) / radius;
           this.nextPressureGrid[idx] += 80.0 * pFactor;
           this.nextTempGrid[idx] += 1200.0 * pFactor;

           if (Math.random() < fireAmount) {
             if (fireIdx >= 0) {
              this.nextGrid[idx] = fireIdx;
              this.nextLifeGrid[idx] = 60 + Math.floor(Math.random() * 40);
              this.nextTempGrid[idx] = Math.max(this.nextTempGrid[idx], 1500); // Explosions are hot!
             }
           } else if (sparkIdx >= 0 && Math.random() < 0.3) {
              this.nextGrid[idx] = sparkIdx;
              if (sparkId === 'embr') {
                  this.nextTempGrid[idx] = 495.15; // 222C
                  this.nextLifeGrid[idx] = 40 + Math.floor(Math.random() * 40);
              }
           } else if (Math.random() < 0.1) {
              this.nextGrid[idx] = 0; // Air
           }
         }
       }
     }
  }

  public render(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.grid.length; i++) {
        const elIdx = this.grid[i];

        // Optimization: Skip empty pixels (Air) if NORMAL view
        if (elIdx === 0 && this.viewMode === ViewMode.NORMAL) {
          this.buffer[i] = 0xFF000000;
          continue;
        }

        const element = this.elementList[elIdx];
        const color = element.color;
        const life = this.lifeGrid[i];
        const temp = this.tempGrid[i];
        const pressure = this.pressureGrid[i];
        
        let finalColor = color;

        if (element.flatColor) {
           finalColor = color;
        } else if (this.viewMode === ViewMode.NORMAL) {
           // Normal variation
           const hash = (i * 123456) % 100;
           if (hash > 80) finalColor = this.lerpColor(color, '#ffffff', 0.05);
           else if (hash < 20) finalColor = this.lerpColor(color, '#000000', 0.05);
        }

        // Decoration overlay
        if (this.showDecoration && this.decoGrid[i] !== 0 && this.viewMode === ViewMode.NORMAL) {
           const decoColor = this.uint32ToHex(this.decoGrid[i]);
           if (element.id === 'lcry') {
              if (life > 0) {
                 finalColor = decoColor;
              } else {
                 finalColor = this.lerpColor(decoColor, '#000000', 0.5);
              }
           } else {
              finalColor = decoColor;
           }
        } else if (element.id === 'lcry' && this.viewMode === ViewMode.NORMAL) {
           // Default LCRY behavior if no decoration
           if (life > 0) {
              finalColor = color;
           } else {
              finalColor = this.lerpColor(color, '#000000', 0.5);
           }
        }

        if (i % this.width === 0) {
            // New row logic if needed, but ctx.fillRect is used below
        }
        if (this.viewMode === ViewMode.HEAT) {
            // Heat view: Blue -> Light Blue -> Cyan -> Green -> Yellow -> Orange -> Red -> Pink
            // Air remains black
            if (elIdx === 0) {
              this.buffer[i] = 0xFF000000;
              continue;
            }
            
            const tempC = temp - 273.15;
            if (tempC < -150) finalColor = '#00008B'; // Dark Blue
            else if (tempC < -50) finalColor = '#00BFFF'; // Light Blue
            else if (tempC < 10) finalColor = '#00FFFF'; // Cyan
            else if (tempC < 60) finalColor = '#00FF00'; // Green
            else if (tempC < 200) finalColor = '#FFFF00'; // Yellow
            else if (tempC < 600) finalColor = '#FF8C00'; // Orange
            else if (tempC < 2000) finalColor = '#FF0000'; // Red
            else finalColor = '#FFC0CB'; // Pink (very hot)
        } else if (this.viewMode === ViewMode.PRESSURE) {
            // Pressure view: High = Green, Vacuum = Blue -> Red
            if (pressure > 0.5) {
              // Scale green intensity?
              finalColor = '#00FF00'; 
            } else if (pressure < -0.1) {
              // Vacuum: Blue for slight, Red for deep
              const intensity = Math.min(Math.abs(pressure) / 10, 1.0);
              finalColor = this.lerpColor('#0000FF', '#FF0000', intensity);
            } else {
              finalColor = '#000000';
            }
        } else if (this.viewMode === ViewMode.LIFE) {
            // Life view: High (White/Light Grey) -> Low (Dark Grey)
            if (elIdx !== 0 || life > 0) {
              let intensity = 0;
              if (life > 0) {
                if (life > 4) {
                  intensity = Math.min(life / 100, 1.0); // Fire/Smoke loop
                } else {
                  intensity = Math.min(life / 4, 1.0); // Electricity
                }
              }
              const grey = Math.floor(64 + intensity * (255 - 64)); // Dark grey (64) to White (255)
              finalColor = `rgb(${grey},${grey},${grey})`;
            } else {
              finalColor = '#1a1a1a'; // Dark grey for "no life"
            }
            if (typeof finalColor === 'string' && finalColor.startsWith('rgb')) {
                const parts = finalColor.match(/\d+/g);
                if (parts) {
                    const r = parseInt(parts[0]);
                    const g = parseInt(parts[1]);
                    const b = parseInt(parts[2]);
                    finalColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                }
            }
        } else {
            // Normal view
            // Fire custom color gradient
            if (element.id === 'fire') {
              if (life > 80) {
                finalColor = '#FFFF00'; // Yellow
              } else if (life > 40) {
                finalColor = '#FF8800'; // Orange
              } else {
                finalColor = '#FF4500'; // Red
              }
              
              if (Math.random() > 0.8) {
                finalColor = this.lerpColor(finalColor, '#FFFFFF', 0.3);
              }
            } else if (elIdx !== 0) {
                // Temperature-based color shifts (Skip for Air and Gases if they are cooling down)
                if (temp < 273.15 && element.state !== PhysicalState.GAS) {
                   const intensity = Math.min((273.15 - temp) / 273.15, 0.5);
                   finalColor = this.lerpColor(finalColor, '#0066FF', intensity);
                } else if (temp > 350 && temp <= 800) {
                   const intensity = Math.min((temp - 350) / 450, 0.4);
                   finalColor = this.lerpColor(finalColor, '#FF3300', intensity);
                } else if (temp > 800) {
                   const glowColor = this.getGlowColor(temp);
                   const intensity = Math.min((temp - 800) / 1500, 1.0);
                   finalColor = this.lerpColor(finalColor, glowColor, intensity);
                }
            }

            // Spark overlay
            if (life > 0 && (element.id === 'sprk' || element.id === 'embr')) {
              const sparkColor = '#FFFFCC';
              const intensity = Math.min(life / 4, 1.0);
              finalColor = this.lerpColor(finalColor, sparkColor, intensity);
            } else if (life > 0 && element.id !== 'fire' && element.id !== 'smke') {
              // Minimal lightening for other powered things (like wires/silicon)
              finalColor = this.lerpColor(finalColor, '#FFFFFF', 0.15);
            }
        }

        this.buffer[i] = this.hexToUint32(finalColor);
    }
    
    // Render Particles
    for (const p of this.particles) {
        const px = Math.floor(p.x);
        const py = Math.floor(p.y);
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
            this.buffer[py * this.width + px] = this.hexToABGR(p.color);
        }
    }

    ctx.putImageData(this.imageData, 0, 0);
  }

  private hexToABGR(hex: string): number {
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    return (255 << 24) | (b << 16) | (g << 8) | r;
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

  private uint32ToHex(val: number): string {
    const r = val & 0xFF;
    const g = (val >> 8) & 0xFF;
    const b = (val >> 16) & 0xFF;
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
}
