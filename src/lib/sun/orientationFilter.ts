// Low-pass filter for device-orientation jitter.
//
// Compass (alpha) is a circular value, so a naive running average of degrees
// would jump when the reading crosses 0°/360°. We average sin/cos vectors
// instead. Beta and gamma are bounded and can use a plain linear average.

const DEG = Math.PI / 180;

export class CircularRunningAverage {
  private xs: number[] = [];
  private ys: number[] = [];
  private maxSize: number;

  constructor(maxSize = 5) {
    this.maxSize = Math.max(1, maxSize);
  }

  push(degrees: number): number {
    const rad = degrees * DEG;
    this.xs.push(Math.cos(rad));
    this.ys.push(Math.sin(rad));
    if (this.xs.length > this.maxSize) { this.xs.shift(); this.ys.shift(); }
    const sx = this.xs.reduce((a, b) => a + b, 0) / this.xs.length;
    const sy = this.ys.reduce((a, b) => a + b, 0) / this.ys.length;
    let out = Math.atan2(sy, sx) / DEG;
    if (out < 0) out += 360;
    return out;
  }

  reset(): void { this.xs = []; this.ys = []; }
}

export class LinearRunningAverage {
  private samples: number[] = [];
  private maxSize: number;

  constructor(maxSize = 5) {
    this.maxSize = Math.max(1, maxSize);
  }

  push(value: number): number {
    this.samples.push(value);
    if (this.samples.length > this.maxSize) this.samples.shift();
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  reset(): void { this.samples = []; }
}

export interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
}

export class OrientationFilter {
  private alphaAvg: CircularRunningAverage;
  private betaAvg: LinearRunningAverage;
  private gammaAvg: LinearRunningAverage;

  constructor(windowSize = 5) {
    this.alphaAvg = new CircularRunningAverage(windowSize);
    this.betaAvg = new LinearRunningAverage(windowSize);
    this.gammaAvg = new LinearRunningAverage(windowSize);
  }

  push(s: OrientationSample): OrientationSample {
    return {
      alpha: this.alphaAvg.push(s.alpha),
      beta: this.betaAvg.push(s.beta),
      gamma: this.gammaAvg.push(s.gamma),
    };
  }

  reset(): void {
    this.alphaAvg.reset();
    this.betaAvg.reset();
    this.gammaAvg.reset();
  }
}
