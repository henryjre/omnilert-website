export const DEFAULT_THEME_COLOR = '#2563EB';

const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LIGHTNESS_OFFSETS: Record<(typeof STOPS)[number], number> = {
  50: 45,
  100: 38,
  200: 28,
  300: 18,
  400: 8,
  500: 3,
  600: 0,
  700: -7,
  800: -14,
  900: -22,
  950: -30,
};

export function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }
  h = Math.round((h * 60 + 360) % 360);

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h >= 0 && h < 60) {
    r1 = c;
    g1 = x;
  } else if (h >= 60 && h < 120) {
    r1 = x;
    g1 = c;
  } else if (h >= 120 && h < 180) {
    g1 = c;
    b1 = x;
  } else if (h >= 180 && h < 240) {
    g1 = x;
    b1 = c;
  } else if (h >= 240 && h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function buildPrimaryScale(hex: string): Record<(typeof STOPS)[number], string> {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const scale = {} as Record<(typeof STOPS)[number], string>;

  for (const stop of STOPS) {
    const lightness = clamp(l + LIGHTNESS_OFFSETS[stop], 8, 98);
    const saturation = clamp(s + (stop <= 300 ? -5 : stop >= 800 ? 4 : 0), 10, 95);
    const rgb = hslToRgb(h, saturation, lightness);
    scale[stop] = `${rgb.r} ${rgb.g} ${rgb.b}`;
  }

  return scale;
}

export function applyCompanyThemeFromHex(input?: string | null): string {
  const hex = input && isValidHexColor(input) ? input.toUpperCase() : DEFAULT_THEME_COLOR;
  const root = document.documentElement;
  const scale = buildPrimaryScale(hex);

  for (const stop of STOPS) {
    root.style.setProperty(`--primary-${stop}`, scale[stop]);
  }

  return hex;
}

