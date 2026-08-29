import { Vec3 } from '../types';

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t)
  };
}

export function deadzone(value: number, threshold: number): number {
  return Math.abs(value) < threshold ? 0 : value;
}

export class ExpSmoother {
  private value: number | null = null;
  
  constructor(private alpha: number) {}
  
  update(newValue: number): number {
    if (this.value === null) {
      this.value = newValue;
    } else {
      this.value = lerp(this.value, newValue, this.alpha);
    }
    return this.value;
  }
  
  reset(): void {
    this.value = null;
  }
}

export class Vec3Smoother {
  private xSmoother: ExpSmoother;
  private ySmoother: ExpSmoother;
  private zSmoother: ExpSmoother;
  
  constructor(alpha: number) {
    this.xSmoother = new ExpSmoother(alpha);
    this.ySmoother = new ExpSmoother(alpha);
    this.zSmoother = new ExpSmoother(alpha);
  }
  
  update(v: Vec3): Vec3 {
    return {
      x: this.xSmoother.update(v.x),
      y: this.ySmoother.update(v.y),
      z: this.zSmoother.update(v.z)
    };
  }
  
  reset(): void {
    this.xSmoother.reset();
    this.ySmoother.reset();
    this.zSmoother.reset();
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
