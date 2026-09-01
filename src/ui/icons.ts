/**
 * icons.ts — Iconos Lucide (SVG estáticos, sin framework).
 */
import playRaw from 'lucide-static/icons/play.svg?raw';
import pauseRaw from 'lucide-static/icons/pause.svg?raw';
import rewindRaw from 'lucide-static/icons/rewind.svg?raw';
import xRaw from 'lucide-static/icons/x.svg?raw';
import sunRaw from 'lucide-static/icons/sun.svg?raw';
import orbitRaw from 'lucide-static/icons/orbit.svg?raw';
import crosshairRaw from 'lucide-static/icons/crosshair.svg?raw';
import layersRaw from 'lucide-static/icons/layers.svg?raw';
import telescopeRaw from 'lucide-static/icons/telescope.svg?raw';
import rocketRaw from 'lucide-static/icons/rocket.svg?raw';
import windRaw from 'lucide-static/icons/wind.svg?raw';
import thermometerRaw from 'lucide-static/icons/thermometer.svg?raw';
import gaugeRaw from 'lucide-static/icons/gauge.svg?raw';
import infoRaw from 'lucide-static/icons/info.svg?raw';
import clockRaw from 'lucide-static/icons/clock.svg?raw';
import globeRaw from 'lucide-static/icons/globe.svg?raw';
import focusRaw from 'lucide-static/icons/focus.svg?raw';
import sparklesRaw from 'lucide-static/icons/sparkles.svg?raw';
import historyRaw from 'lucide-static/icons/history.svg?raw';

export function icon(raw: string, cls = 'w-4 h-4'): string {
  return raw.replace('<svg ', `<svg class="${cls}" `);
}

export const ICONS = {
  play: playRaw,
  pause: pauseRaw,
  rewind: rewindRaw,
  x: xRaw,
  sun: sunRaw,
  orbit: orbitRaw,
  crosshair: crosshairRaw,
  layers: layersRaw,
  telescope: telescopeRaw,
  rocket: rocketRaw,
  wind: windRaw,
  thermometer: thermometerRaw,
  gauge: gaugeRaw,
  info: infoRaw,
  clock: clockRaw,
  globe: globeRaw,
  focus: focusRaw,
  sparkles: sparklesRaw,
  history: historyRaw
};
