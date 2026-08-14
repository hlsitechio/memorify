// Accent theme management — applies CSS variables for primary/ring/glow/gradients

export type HSL = { h: number; s: number; l: number };

export const ACCENT_PRESETS: { name: string; hsl: HSL }[] = [
  { name: "Teal", hsl: { h: 174, s: 85, l: 55 } },
  { name: "Cyan", hsl: { h: 190, s: 90, l: 55 } },
  { name: "Blue", hsl: { h: 217, s: 91, l: 60 } },
  { name: "Indigo", hsl: { h: 243, s: 75, l: 65 } },
  { name: "Violet", hsl: { h: 270, s: 80, l: 65 } },
  { name: "Pink", hsl: { h: 330, s: 80, l: 62 } },
  { name: "Rose", hsl: { h: 350, s: 80, l: 60 } },
  { name: "Orange", hsl: { h: 25, s: 90, l: 58 } },
  { name: "Amber", hsl: { h: 40, s: 95, l: 58 } },
  { name: "Lime", hsl: { h: 90, s: 75, l: 55 } },
  { name: "Emerald", hsl: { h: 152, s: 70, l: 50 } },
];

let inMemoryAccent: HSL | null = null;

export function hexToHsl(hex: string): HSL {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex({ h, s, l }: HSL): string {
  const sn = s / 100, ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const color = ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function applyAccent(hsl: HSL) {
  const r = document.documentElement.style;
  const base = `${hsl.h} ${hsl.s}% ${hsl.l}%`;
  const glow = `${hsl.h} ${Math.min(100, hsl.s + 5)}% ${Math.min(80, hsl.l + 5)}%`;
  const accentBg = `${hsl.h} ${Math.max(30, hsl.s - 15)}% 18%`;
  const accentFg = `${hsl.h} ${Math.min(100, hsl.s + 5)}% 75%`;
  r.setProperty("--primary", base);
  r.setProperty("--primary-glow", glow);
  r.setProperty("--ring", base);
  r.setProperty("--accent", accentBg);
  r.setProperty("--accent-foreground", accentFg);
  r.setProperty(
    "--gradient-primary",
    `linear-gradient(135deg, hsl(${base}), hsl(${glow}))`
  );
  r.setProperty(
    "--gradient-radial",
    `radial-gradient(ellipse at top, hsl(${base} / 0.18), transparent 60%)`
  );
  r.setProperty("--shadow-glow", `0 0 60px -10px hsl(${base} / 0.5)`);
}

export function getStoredAccent(): HSL | null {
  return inMemoryAccent;
}

export function setStoredAccent(hsl: HSL) {
  inMemoryAccent = hsl;
  applyAccent(hsl);
  // Persist per workspace too — lazy-import to avoid circular deps.
  void persistWorkspaceAccent(hsl);
  window.dispatchEvent(new CustomEvent("accent-change", { detail: hsl }));
}

export function resetAccent() {
  inMemoryAccent = null;
  const r = document.documentElement.style;
  ["--primary", "--primary-glow", "--ring", "--accent", "--accent-foreground", "--gradient-primary", "--gradient-radial", "--shadow-glow"].forEach((p) => r.removeProperty(p));
  void persistWorkspaceAccent(null);
  window.dispatchEvent(new CustomEvent("accent-change"));
}

export function initAccent() {
  const stored = getStoredAccent();
  if (stored) applyAccent(stored);
}

// Save the accent into workspace_prefs for the active workspace so it follows
// the agent across devices. Lazy-imported to keep theme.ts framework-free.
async function persistWorkspaceAccent(_hsl: HSL | null) {
  // In-memory only — workspace_prefs will handle persistence via api.ts
  // when the workspace.prefs copilot command is available.
  try {
    const [{ readCurrentWorkspace }, { savePrefs }] = await Promise.all([
      import("@/hooks/useCurrentWorkspace"),
      import("@/lib/workspace-prefs"),
    ]);
    const ws = readCurrentWorkspace();
    const wsKey = ws?.id ?? "default";
    savePrefs(wsKey, { accent: _hsl });
  } catch { /* ignore */ }
}
