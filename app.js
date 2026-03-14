// ============================================================
// CONFIGURABLE PIGMENT DEFINITIONS
// ============================================================
const PIGMENTS = [
  { name: 'Red',    rgb: [185, 58, 42],   color: '#b93a2a' },  // Bayferrox 4110 yellowish red
  { name: 'Green',  rgb: [50, 120, 50],   color: '#327832' },  // unchanged
  { name: 'Black',  rgb: [32, 31, 30],    color: '#201f1e' },  // Bayferrox 4330 magnetite
  { name: 'Brown',  rgb: [105, 58, 25],   color: '#693a19' },  // Bayferrox 4686 dark brown
  { name: 'Yellow', rgb: [200, 175, 45],  color: '#c8af2d' },  // Bayferrox 4920 goethite
];

const CEMENT_PRESETS = {
  white: { name: 'White Cement', rgb: [235, 230, 220], hex: '#ebe6dc' },
  grey:  { name: 'Grey Cement',  rgb: [150, 148, 144], hex: '#969490' },
};
let cementType = 'white';
let WHITE_CEMENT = CEMENT_PRESETS.white.rgb.slice();
let MAX_PIGMENT_LOAD = 30;

// State
let currentMode = 'auto';
let imageData = null;
let imageWidth = 0;
let imageHeight = 0;
let targetColor = null;    // [r, g, b]
let autoRecipe = null;     // [r, g, b, br, y] percentages
let currentRecipe = null;
let dominantColors = [];

// ============================================================
// COLOR SCIENCE: sRGB -> Linear RGB -> XYZ (D65) -> CIELAB
// ============================================================
function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rgbToXyz(rgb) {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  return [
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100,
    (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) * 100,
    (0.0193339 * r + 0.0451597 * g + 0.9503041 * b) * 100,
  ];
}

function xyzToRgb(xyz) {
  const x = xyz[0] / 100;
  const y = xyz[1] / 100;
  const z = xyz[2] / 100;
  let r =  3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  let g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  let b =  0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [
    Math.round(linearToSrgb(r) * 255),
    Math.round(linearToSrgb(g) * 255),
    Math.round(linearToSrgb(b) * 255),
  ];
}

const D65 = [95.047, 100.0, 108.883];

function xyzToLab(xyz) {
  let x = xyz[0] / D65[0];
  let y = xyz[1] / D65[1];
  let z = xyz[2] / D65[2];
  const e = 0.008856;
  const k = 903.3;
  x = x > e ? Math.cbrt(x) : (k * x + 16) / 116;
  y = y > e ? Math.cbrt(y) : (k * y + 16) / 116;
  z = z > e ? Math.cbrt(z) : (k * z + 16) / 116;
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labToXyz(lab) {
  const fy = (lab[0] + 16) / 116;
  const fx = lab[1] / 500 + fy;
  const fz = fy - lab[2] / 200;
  const e = 0.008856;
  const k = 903.3;
  const x = (fx * fx * fx > e ? fx * fx * fx : (116 * fx - 16) / k) * D65[0];
  const y = (lab[0] > k * e ? Math.pow((lab[0] + 16) / 116, 3) : lab[0] / k) * D65[1];
  const z = (fz * fz * fz > e ? fz * fz * fz : (116 * fz - 16) / k) * D65[2];
  return [x, y, z];
}

function rgbToLab(rgb) { return xyzToLab(rgbToXyz(rgb)); }
function labToRgb(lab) { return xyzToRgb(labToXyz(lab)); }

// ΔE CIE76
function deltaE76(lab1, lab2) {
  return Math.sqrt(
    (lab1[0] - lab2[0]) ** 2 +
    (lab1[1] - lab2[1]) ** 2 +
    (lab1[2] - lab2[2]) ** 2
  );
}

// ΔE CIE2000
function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const avgL = (L1 + L2) / 2;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2;
  const avgC7 = Math.pow(avgC, 7);
  const G = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const avgCp = (C1p + C2p) / 2;
  let h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * 180 / Math.PI;
  if (h2p < 0) h2p += 360;
  let avgHp;
  if (Math.abs(h1p - h2p) > 180) {
    avgHp = (h1p + h2p + 360) / 2;
  } else {
    avgHp = (h1p + h2p) / 2;
  }
  const T = 1
    - 0.17 * Math.cos((avgHp - 30) * Math.PI / 180)
    + 0.24 * Math.cos((2 * avgHp) * Math.PI / 180)
    + 0.32 * Math.cos((3 * avgHp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * avgHp - 63) * Math.PI / 180);
  let dhp = h2p - h1p;
  if (Math.abs(dhp) > 180) {
    if (h2p <= h1p) dhp += 360;
    else dhp -= 360;
  }
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
  const SL = 1 + 0.015 * (avgL - 50) ** 2 / Math.sqrt(20 + (avgL - 50) ** 2);
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const dTheta = 30 * Math.exp(-(Math.pow((avgHp - 275) / 25, 2)));
  const avgCp7 = Math.pow(avgCp, 7);
  const RC = 2 * Math.sqrt(avgCp7 / (avgCp7 + Math.pow(25, 7)));
  const RT = -Math.sin(2 * dTheta * Math.PI / 180) * RC;
  return Math.sqrt(
    (dLp / SL) ** 2 +
    (dCp / SC) ** 2 +
    (dHp / SH) ** 2 +
    RT * (dCp / SC) * (dHp / SH)
  );
}

// ============================================================
// MIXING MODEL (Kubelka-Munk via Spectral.js)
// ============================================================

// Cache for precomputed spectral.Color objects (invalidated on calibration change)
let _cachedSpectral = null;
let _spectralCacheKey = '';

function getCachedSpectral() {
  const key = PIGMENTS.map(p => p.rgb.join(',')).join('|') + '|' + WHITE_CEMENT.join(',');
  if (key !== _spectralCacheKey) {
    _cachedSpectral = {
      pigmentColors: PIGMENTS.map(p => new spectral.Color(p.rgb)),
      whiteColor: new spectral.Color(WHITE_CEMENT)
    };
    _spectralCacheKey = key;
  }
  return _cachedSpectral;
}

function mixColor(percentages) {
  const { pigmentColors, whiteColor } = getCachedSpectral();

  let totalPigment = 0;
  for (let i = 0; i < 5; i++) totalPigment += percentages[i];
  const whitePct = 100 - totalPigment;

  const pairs = [[whiteColor, whitePct / 100]];
  for (let i = 0; i < 5; i++) {
    if (percentages[i] > 0) {
      pairs.push([pigmentColors[i], percentages[i] / 100]);
    }
  }

  const mixed = spectral.mix(...pairs);
  // mixed.sRGB is [r, g, b] in 0-255, convert to Lab via existing pipeline
  return rgbToLab(mixed.sRGB);
}

function mixColorToRgb(percentages) {
  return labToRgb(mixColor(percentages));
}

// ============================================================
// OPTIMIZATION: Two-phase grid search
// ============================================================
function optimizeRecipe(targetLab) {
  const maxLoad = MAX_PIGMENT_LOAD;
  let bestDe = Infinity;
  let bestPct = [0, 0, 0, 0, 0];

  // Phase 1: Coarse search (5% increments)
  const step1 = 5;
  for (let r = 0; r <= maxLoad; r += step1) {
    for (let g = 0; g <= maxLoad - r; g += step1) {
      for (let k = 0; k <= maxLoad - r - g; k += step1) {
        for (let br = 0; br <= maxLoad - r - g - k; br += step1) {
          const maxY = maxLoad - r - g - k - br;
          for (let y = 0; y <= maxY; y += step1) {
            const pct = [r, g, k, br, y];
            const mixed = mixColor(pct);
            const de = deltaE2000(targetLab, mixed);
            if (de < bestDe) {
              bestDe = de;
              bestPct = pct.slice();
            }
          }
        }
      }
    }
  }

  // Phase 2: Fine search (0.5% increments) around best coarse result
  const step2 = 0.5;
  const range = 5;
  const best2 = bestPct.slice();
  bestDe = Infinity;

  const lo = best2.map(v => Math.max(0, v - range));
  const hi = best2.map(v => v + range);

  for (let r = lo[0]; r <= hi[0]; r += step2) {
    for (let g = lo[1]; g <= hi[1] && r + g <= maxLoad; g += step2) {
      for (let k = lo[2]; k <= hi[2] && r + g + k <= maxLoad; k += step2) {
        for (let br = lo[3]; br <= hi[3] && r + g + k + br <= maxLoad; br += step2) {
          const maxY = Math.min(hi[4], maxLoad - r - g - k - br);
          for (let y = lo[4]; y <= maxY; y += step2) {
            const pct = [r, g, k, br, y];
            const mixed = mixColor(pct);
            const de = deltaE2000(targetLab, mixed);
            if (de < bestDe) {
              bestDe = de;
              bestPct = pct.slice();
            }
          }
        }
      }
    }
  }

  // Phase 3: Ultra-fine (0.1% increments) — coordinate descent
  // Refine one pigment at a time, multiple passes for convergence
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < 5; i++) {
      let bestVal = bestPct[i];
      const lo = Math.max(0, bestVal - 1);
      const hi = bestVal + 1;
      for (let v = lo; v <= hi + 0.001; v += 0.1) {
        const vr = Math.round(v * 10) / 10;
        const oldVal = bestPct[i];
        bestPct[i] = vr;
        const total = bestPct.reduce((a, b) => a + b, 0);
        if (total <= maxLoad + 0.001) {
          const de = deltaE2000(targetLab, mixColor(bestPct));
          if (de < bestDe) {
            bestDe = de;
            bestVal = vr;
          } else {
            bestPct[i] = oldVal;
          }
        } else {
          bestPct[i] = oldVal;
        }
      }
      bestPct[i] = bestVal;
    }
  }

  return bestPct.map(v => Math.round(v * 10) / 10);
}

// ============================================================
// K-MEANS CLUSTERING
// ============================================================
function kMeansClustering(pixels, k, iterations) {
  // Initialize centroids using k-means++ style
  const centroids = [];
  centroids.push(pixels[Math.floor(Math.random() * pixels.length)].slice());

  for (let c = 1; c < k; c++) {
    const dists = pixels.map(p => {
      let minD = Infinity;
      for (const cen of centroids) {
        const d = (p[0]-cen[0])**2 + (p[1]-cen[1])**2 + (p[2]-cen[2])**2;
        if (d < minD) minD = d;
      }
      return minD;
    });
    const totalD = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalD;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(pixels[i].slice()); break; }
    }
    if (centroids.length <= c) centroids.push(pixels[Math.floor(Math.random() * pixels.length)].slice());
  }

  const assignments = new Int32Array(pixels.length);

  for (let iter = 0; iter < iterations; iter++) {
    // Assign
    for (let i = 0; i < pixels.length; i++) {
      let minD = Infinity, minK = 0;
      for (let c = 0; c < k; c++) {
        const d = (pixels[i][0]-centroids[c][0])**2 + (pixels[i][1]-centroids[c][1])**2 + (pixels[i][2]-centroids[c][2])**2;
        if (d < minD) { minD = d; minK = c; }
      }
      assignments[i] = minK;
    }
    // Update
    const sums = Array.from({length: k}, () => [0, 0, 0]);
    const counts = new Int32Array(k);
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c][0] = sums[c][0] / counts[c];
        centroids[c][1] = sums[c][1] / counts[c];
        centroids[c][2] = sums[c][2] / counts[c];
      }
    }
  }

  // Count cluster sizes
  const counts = new Int32Array(k);
  for (let i = 0; i < assignments.length; i++) counts[assignments[i]]++;

  const results = centroids.map((c, i) => ({
    rgb: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])],
    count: counts[i],
  }));

  results.sort((a, b) => b.count - a.count);
  return results;
}

// ============================================================
// IMAGE HANDLING
// ============================================================
function handleImage(file) {
  if (!file || !file.type.match(/image\/(jpeg|png|webp)/)) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.getElementById('hidden-canvas');
      const displayCanvas = document.getElementById('image-display');
      const maxW = 800;
      let w = img.width, h = img.height;
      if (w > maxW) { h = h * maxW / w; w = maxW; }
      canvas.width = w;
      canvas.height = h;
      displayCanvas.width = w;
      displayCanvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dCtx = displayCanvas.getContext('2d');
      dCtx.drawImage(img, 0, 0, w, h);
      imageData = ctx.getImageData(0, 0, w, h);
      imageWidth = w;
      imageHeight = h;
      document.getElementById('image-container').style.display = 'block';
      document.getElementById('drop-zone').style.display = 'none';

      if (currentMode === 'auto') {
        runAutoMode();
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function changeImage() {
  document.getElementById('image-container').style.display = 'none';
  document.getElementById('drop-zone').style.display = 'flex';
  document.getElementById('file-input').value = '';
  imageData = null;
  targetColor = null;
  document.getElementById('target-section').classList.remove('visible');
  document.getElementById('recipe-section').classList.remove('visible');
  document.getElementById('tuning-section').classList.remove('visible');
  document.getElementById('dominant-colors').classList.remove('visible');
}

function runAutoMode() {
  if (!imageData) return;
  // Sample pixels
  const data = imageData.data;
  const totalPixels = imageWidth * imageHeight;
  const sampleCount = Math.min(5000, totalPixels);
  const pixels = [];
  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.floor(Math.random() * totalPixels) * 4;
    pixels.push([data[idx], data[idx+1], data[idx+2]]);
  }

  const clusters = kMeansClustering(pixels, 5, 10);
  dominantColors = clusters.slice(0, 3);

  // Show dominant colors
  const container = document.getElementById('dominant-colors');
  // Remove old swatches
  while (container.children.length > 1) container.removeChild(container.lastChild);
  dominantColors.forEach((c, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'dominant-swatch' + (i === 0 ? ' selected' : '');
    swatch.style.backgroundColor = `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`;
    swatch.onclick = () => {
      container.querySelectorAll('.dominant-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      setTargetColor(c.rgb);
    };
    container.appendChild(swatch);
  });
  container.classList.add('visible');

  // Auto-select first dominant color
  setTargetColor(dominantColors[0].rgb);
}

// ============================================================
// EYEDROPPER / LOUPE
// ============================================================
const displayCanvas = document.getElementById('image-display');
const loupe = document.getElementById('loupe');
const loupeCanvas = document.getElementById('loupe-canvas');

displayCanvas.addEventListener('mousemove', function(e) {
  if (currentMode !== 'pick' || !imageData) return;
  const rect = displayCanvas.getBoundingClientRect();
  const scaleX = imageWidth / rect.width;
  const scaleY = imageHeight / rect.height;
  const px = Math.floor((e.clientX - rect.left) * scaleX);
  const py = Math.floor((e.clientY - rect.top) * scaleY);

  // Position loupe
  const lx = e.clientX - rect.left;
  const ly = e.clientY - rect.top;
  loupe.style.display = 'block';
  loupe.style.left = (lx - 55) + 'px';
  loupe.style.top = (ly - 120) + 'px';

  // Draw magnified region
  const lCtx = loupeCanvas.getContext('2d');
  lCtx.clearRect(0, 0, 11, 11);
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const sx = Math.max(0, Math.min(imageWidth - 1, px + dx));
      const sy = Math.max(0, Math.min(imageHeight - 1, py + dy));
      const idx = (sy * imageWidth + sx) * 4;
      lCtx.fillStyle = `rgb(${imageData.data[idx]},${imageData.data[idx+1]},${imageData.data[idx+2]})`;
      lCtx.fillRect(dx + 5, dy + 5, 1, 1);
    }
  }
});

displayCanvas.addEventListener('mouseleave', function() {
  loupe.style.display = 'none';
});

displayCanvas.addEventListener('click', function(e) {
  if (currentMode !== 'pick' || !imageData) return;
  const rect = displayCanvas.getBoundingClientRect();
  const scaleX = imageWidth / rect.width;
  const scaleY = imageHeight / rect.height;
  const px = Math.floor((e.clientX - rect.left) * scaleX);
  const py = Math.floor((e.clientY - rect.top) * scaleY);
  const idx = (py * imageWidth + px) * 4;
  const r = imageData.data[idx];
  const g = imageData.data[idx + 1];
  const b = imageData.data[idx + 2];
  setTargetColor([r, g, b]);
});

// Touch support for eyedropper
displayCanvas.addEventListener('touchmove', function(e) {
  if (currentMode !== 'pick' || !imageData) return;
  e.preventDefault();
  const touch = e.touches[0];
  const rect = displayCanvas.getBoundingClientRect();
  const scaleX = imageWidth / rect.width;
  const scaleY = imageHeight / rect.height;
  const px = Math.floor((touch.clientX - rect.left) * scaleX);
  const py = Math.floor((touch.clientY - rect.top) * scaleY);

  loupe.style.display = 'block';
  const lx = touch.clientX - rect.left;
  const ly = touch.clientY - rect.top;
  loupe.style.left = (lx - 55) + 'px';
  loupe.style.top = (ly - 120) + 'px';

  const lCtx = loupeCanvas.getContext('2d');
  lCtx.clearRect(0, 0, 11, 11);
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const sx = Math.max(0, Math.min(imageWidth - 1, px + dx));
      const sy = Math.max(0, Math.min(imageHeight - 1, py + dy));
      const idx2 = (sy * imageWidth + sx) * 4;
      lCtx.fillStyle = `rgb(${imageData.data[idx2]},${imageData.data[idx2+1]},${imageData.data[idx2+2]})`;
      lCtx.fillRect(dx + 5, dy + 5, 1, 1);
    }
  }
}, { passive: false });

displayCanvas.addEventListener('touchend', function(e) {
  if (currentMode !== 'pick' || !imageData) return;
  const touch = e.changedTouches[0];
  const rect = displayCanvas.getBoundingClientRect();
  const scaleX = imageWidth / rect.width;
  const scaleY = imageHeight / rect.height;
  const px = Math.floor((touch.clientX - rect.left) * scaleX);
  const py = Math.floor((touch.clientY - rect.top) * scaleY);
  const idx = (py * imageWidth + px) * 4;
  setTargetColor([imageData.data[idx], imageData.data[idx+1], imageData.data[idx+2]]);
  loupe.style.display = 'none';
});

// ============================================================
// MODE SWITCHING
// ============================================================
function setMode(mode) {
  currentMode = mode;
  document.getElementById('mode-auto').classList.toggle('active', mode === 'auto');
  document.getElementById('mode-pick').classList.toggle('active', mode === 'pick');
  displayCanvas.style.cursor = mode === 'pick' ? 'crosshair' : 'default';

  if (mode === 'auto') {
    document.getElementById('dominant-colors').classList.add('visible');
    loupe.style.display = 'none';
    if (imageData) runAutoMode();
  } else {
    document.getElementById('dominant-colors').classList.remove('visible');
  }
}

// ============================================================
// SET TARGET COLOR & COMPUTE RECIPE
// ============================================================
function setTargetColor(rgb) {
  targetColor = rgb;
  const lab = rgbToLab(rgb);
  const hex = rgbToHex(rgb);

  document.getElementById('target-swatch').style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  document.getElementById('target-hex').textContent = hex;
  document.getElementById('target-rgb').textContent = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  document.getElementById('target-lab').textContent = `${lab[0].toFixed(1)}, ${lab[1].toFixed(1)}, ${lab[2].toFixed(1)}`;
  document.getElementById('target-section').classList.add('visible');

  document.getElementById('summary-target-swatch').style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  // Show computing state
  document.getElementById('recipe-section').classList.add('visible');
  document.getElementById('tuning-section').classList.add('visible');
  document.getElementById('delta-e-value').textContent = '...';
  document.getElementById('delta-e-quality').textContent = 'Computing';
  document.getElementById('delta-e-quality').className = 'quality';

  // Defer optimization to allow UI update
  setTimeout(() => {
    autoRecipe = optimizeRecipe(lab);
    currentRecipe = autoRecipe.slice();
    updateRecipeDisplay();
    updateTuningSliders();
  }, 10);
}

function updateRecipeDisplay() {
  const recipe = currentRecipe;
  const barsContainer = document.getElementById('recipe-bars');
  barsContainer.innerHTML = '';

  const totalPigment = recipe.reduce((a, b) => a + b, 0);
  const whitePercent = 100 - totalPigment;
  const maxBar = Math.max(...recipe, 1);

  // Pigment rows
  for (let i = 0; i < 5; i++) {
    const row = document.createElement('div');
    row.className = 'pigment-row';
    row.innerHTML = `
      <div class="pigment-swatch" style="background:${PIGMENTS[i].color}"></div>
      <div class="pigment-name">${PIGMENTS[i].name}</div>
      <div class="pigment-bar-wrap">
        <div class="pigment-bar" style="width:${(recipe[i]/maxBar)*100}%;background:${PIGMENTS[i].color}"></div>
      </div>
      <div class="pigment-pct">${recipe[i].toFixed(1)}%</div>
    `;
    barsContainer.appendChild(row);
  }

  // White cement row
  const wRow = document.createElement('div');
  wRow.className = 'pigment-row';
  wRow.innerHTML = `
    <div class="pigment-swatch" style="background:rgb(${WHITE_CEMENT[0]},${WHITE_CEMENT[1]},${WHITE_CEMENT[2]});border:1px solid #555"></div>
    <div class="pigment-name" style="width:auto">${CEMENT_PRESETS[cementType].name}</div>
    <div class="pigment-bar-wrap" style="flex:1">
      <div class="pigment-bar" style="width:100%;background:rgb(${WHITE_CEMENT[0]},${WHITE_CEMENT[1]},${WHITE_CEMENT[2]});opacity:0.5"></div>
    </div>
    <div class="pigment-pct">${whitePercent.toFixed(1)}%</div>
  `;
  barsContainer.appendChild(wRow);

  // Mixed color preview
  const mixedLab = mixColor(recipe);
  const mixedRgb = labToRgb(mixedLab);
  const clampedRgb = mixedRgb.map(v => Math.max(0, Math.min(255, v)));
  document.getElementById('summary-recipe-swatch').style.backgroundColor = `rgb(${clampedRgb[0]},${clampedRgb[1]},${clampedRgb[2]})`;

  // ΔE
  const targetLab = rgbToLab(targetColor);
  const de = deltaE2000(targetLab, mixedLab);
  document.getElementById('delta-e-value').textContent = de.toFixed(1);

  const qualityEl = document.getElementById('delta-e-quality');
  if (de < 1) {
    qualityEl.textContent = 'Imperceptible';
    qualityEl.className = 'quality quality-excellent';
  } else if (de <= 3) {
    qualityEl.textContent = 'Close match';
    qualityEl.className = 'quality quality-good';
  } else if (de <= 5) {
    qualityEl.textContent = 'Noticeable';
    qualityEl.className = 'quality quality-fair';
  } else {
    qualityEl.textContent = 'Poor match — closest possible';
    qualityEl.className = 'quality quality-poor';
  }

  document.getElementById('total-pigment').textContent = totalPigment.toFixed(1);

  // Gamut warning
  document.getElementById('gamut-warning').classList.toggle('visible', de > 5);
}

// ============================================================
// FINE-TUNING SLIDERS
// ============================================================
function buildTuningSliders() {
  const container = document.getElementById('tuning-sliders');
  container.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.innerHTML = `
      <div class="pigment-swatch" style="background:${PIGMENTS[i].color}"></div>
      <label>${PIGMENTS[i].name}</label>
      <input type="range" min="0" max="${MAX_PIGMENT_LOAD}" step="0.1" value="0" id="slider-${i}" oninput="onSliderChange(${i}, this.value)">
      <span class="slider-val" id="slider-val-${i}">0.0%</span>
    `;
    container.appendChild(row);
  }
}

function updateTuningSliders() {
  for (let i = 0; i < 5; i++) {
    const slider = document.getElementById(`slider-${i}`);
    if (slider) {
      slider.max = MAX_PIGMENT_LOAD;
      slider.value = currentRecipe[i];
      document.getElementById(`slider-val-${i}`).textContent = currentRecipe[i].toFixed(1) + '%';
    }
  }
}

function onSliderChange(index, value) {
  value = parseFloat(value);
  const newRecipe = currentRecipe.slice();
  newRecipe[index] = Math.round(value * 10) / 10;

  // Enforce max pigment load
  const total = newRecipe.reduce((a, b) => a + b, 0);
  if (total > MAX_PIGMENT_LOAD) {
    // Scale down others proportionally
    const excess = total - MAX_PIGMENT_LOAD;
    const othersTotal = total - newRecipe[index];
    if (othersTotal > 0) {
      const scale = Math.max(0, (othersTotal - excess) / othersTotal);
      for (let i = 0; i < 5; i++) {
        if (i !== index) newRecipe[i] = Math.round(newRecipe[i] * scale * 10) / 10;
      }
    } else {
      newRecipe[index] = MAX_PIGMENT_LOAD;
    }
  }

  currentRecipe = newRecipe;
  updateTuningSliders();
  updateRecipeDisplay();
}

function resetToAuto() {
  if (autoRecipe) {
    currentRecipe = autoRecipe.slice();
    updateTuningSliders();
    updateRecipeDisplay();
  }
}

// ============================================================
// COPY RECIPE
// ============================================================
function rgbToHex(rgb) {
  return '#' + rgb.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function copyRecipe() {
  if (!targetColor || !currentRecipe) return;
  const totalPigment = currentRecipe.reduce((a, b) => a + b, 0);
  const whitePercent = 100 - totalPigment;
  const mixedLab = mixColor(currentRecipe);
  const targetLab = rgbToLab(targetColor);
  const de = deltaE2000(targetLab, mixedLab);

  let quality;
  if (de < 1) quality = 'Imperceptible';
  else if (de <= 3) quality = 'Close match';
  else if (de <= 5) quality = 'Noticeable';
  else quality = 'Poor match — closest possible';

  const lines = [
    `Target Color: ${rgbToHex(targetColor)}`,
    `Recipe:`,
    ...PIGMENTS.map((p, i) => `  ${p.name.padEnd(8)} ${currentRecipe[i].toFixed(1)}%`),
    `  ${CEMENT_PRESETS[cementType].name}: ${whitePercent.toFixed(1)}%`,
    `Total Pigment: ${totalPigment.toFixed(1)}%`,
    `Match Quality: ΔE ${de.toFixed(1)} (${quality})`,
  ];
  const text = lines.join('\n');

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-recipe-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy Recipe', 1500);
  });
}

// ============================================================
// SETTINGS
// ============================================================
function toggleSettings() {
  const body = document.getElementById('settings-body');
  const arrow = document.getElementById('settings-arrow');
  body.classList.toggle('visible');
  arrow.classList.toggle('open');
}

function updateMaxLoad(val) {
  MAX_PIGMENT_LOAD = parseInt(val);
  document.getElementById('max-load-val').textContent = val + '%';
  // Update slider max values
  for (let i = 0; i < 5; i++) {
    const slider = document.getElementById(`slider-${i}`);
    if (slider) slider.max = MAX_PIGMENT_LOAD;
  }
  // Recompute if we have a target
  if (targetColor) {
    autoRecipe = optimizeRecipe(rgbToLab(targetColor));
    currentRecipe = autoRecipe.slice();
    updateTuningSliders();
    updateRecipeDisplay();
  }
}

function setCementType(type) {
  cementType = type;
  const preset = CEMENT_PRESETS[type];
  WHITE_CEMENT = preset.rgb.slice();

  // Update toggle buttons
  document.getElementById('cement-white').classList.toggle('active', type === 'white');
  document.getElementById('cement-grey').classList.toggle('active', type === 'grey');

  // Sync the calibration color picker and RGB display
  document.getElementById('cal-white').value = rgbToHex(WHITE_CEMENT);
  document.getElementById('cal-white-rgb').textContent = `${WHITE_CEMENT[0]}, ${WHITE_CEMENT[1]}, ${WHITE_CEMENT[2]}`;

  // Update label on calibration row
  document.getElementById('cal-cement-label').textContent = preset.name;

  // Recompute recipe if a target is selected
  if (targetColor) {
    autoRecipe = optimizeRecipe(rgbToLab(targetColor));
    currentRecipe = autoRecipe.slice();
    updateRecipeDisplay();
    updateTuningSliders();
  }
}

function buildCalibrationUI() {
  const container = document.getElementById('pigment-calibration');
  container.innerHTML = '';
  PIGMENTS.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `
      <label>${p.name}</label>
      <input type="color" id="cal-${i}" value="${p.color}" oninput="updateCalibration()">
      <span class="rgb-display" id="cal-rgb-${i}">${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]}</span>
    `;
    container.appendChild(row);
  });
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function updateCalibration() {
  for (let i = 0; i < PIGMENTS.length; i++) {
    const hex = document.getElementById(`cal-${i}`).value;
    const rgb = hexToRgb(hex);
    PIGMENTS[i].rgb = rgb;
    PIGMENTS[i].color = hex;
    document.getElementById(`cal-rgb-${i}`).textContent = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  }
  const whiteHex = document.getElementById('cal-white').value;
  WHITE_CEMENT = hexToRgb(whiteHex);
  CEMENT_PRESETS[cementType].rgb = WHITE_CEMENT.slice();
  CEMENT_PRESETS[cementType].hex = whiteHex;
  document.getElementById('cal-white-rgb').textContent = `${WHITE_CEMENT[0]}, ${WHITE_CEMENT[1]}, ${WHITE_CEMENT[2]}`;

  // Recompute if we have a target
  if (targetColor) {
    autoRecipe = optimizeRecipe(rgbToLab(targetColor));
    currentRecipe = autoRecipe.slice();
    updateRecipeDisplay();
    updateTuningSliders();
  }
}

// ============================================================
// DRAG AND DROP
// ============================================================
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) {
    handleImage(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleImage(fileInput.files[0]);
  }
});

// ============================================================
// INIT
// ============================================================
buildTuningSliders();
buildCalibrationUI();
