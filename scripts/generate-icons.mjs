/**
 * Generates the PWA icon set from one SVG source.
 *
 * Two shapes are produced for a reason:
 *  - "any"     — the mark inside a rounded tile, for platforms that draw the
 *                icon as supplied (iOS, most desktops).
 *  - "maskable"— the same mark inset to ~62% of the canvas, because Android
 *                crops icons to a device-chosen shape (circle, squircle,
 *                teardrop). Without the safe-zone padding the mark gets its
 *                edges shaved off.
 *
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const SAFFRON = '#E8A33D';
const INK = '#0B0E13';

/** The Kajeh mark: ک on a saffron tile. */
const tile = (size, inset) => {
  const pad = Math.round(size * inset);
  const inner = size - pad * 2;
  const radius = Math.round(inner * 0.22);
  const fontSize = Math.round(inner * 0.58);

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${radius}" fill="${SAFFRON}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Vazirmatn, 'Noto Sans Arabic', 'DejaVu Sans', sans-serif"
        font-size="${fontSize}" font-weight="800" fill="${INK}">ک</text>
</svg>`);
};

const targets = [
  // Standard icons — tight inset, the tile fills the canvas.
  { file: 'icon-192.png', size: 192, inset: 0.0, purpose: 'any' },
  { file: 'icon-512.png', size: 512, inset: 0.0, purpose: 'any' },
  // Maskable — mark pulled into the 62% safe zone so cropping cannot clip it.
  { file: 'icon-192-maskable.png', size: 192, inset: 0.19, purpose: 'maskable' },
  { file: 'icon-512-maskable.png', size: 512, inset: 0.19, purpose: 'maskable' },
  // iOS home screen. iOS applies its own rounding and ignores transparency.
  { file: 'apple-touch-icon.png', size: 180, inset: 0.0, purpose: 'apple' },
  { file: 'favicon-32.png', size: 32, inset: 0.0, purpose: 'any' },
];

await mkdir('public/icons', { recursive: true });

for (const target of targets) {
  await sharp(tile(target.size, target.inset))
    .png({ compressionLevel: 9 })
    .toFile(`public/icons/${target.file}`);
  console.log(`  ${target.file}  ${target.size}×${target.size}  (${target.purpose})`);
}

// A scalable favicon for browsers that prefer SVG.
await writeFile('public/icons/icon.svg', tile(512, 0).toString());
console.log('  icon.svg');
