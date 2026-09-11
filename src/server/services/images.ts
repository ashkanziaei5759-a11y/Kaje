/**
 * Menu photo storage.
 *
 * Photos are taken on the owner's phone and uploaded from the gallery, so they
 * arrive as 3–12 MB originals from a modern camera. Serving those untouched to
 * a diner on mobile data would make the menu unusable, so every upload is
 * re-encoded here: resized to a sane maximum, converted to WebP, and stripped
 * of EXIF — which matters beyond file size, because phone photos carry GPS
 * coordinates and publishing those on a public menu would leak where the
 * picture was taken.
 *
 * Two renditions are written: a display image and a thumbnail for the admin
 * list. Both are content-hashed, so replacing a photo never serves a stale
 * cached copy.
 */
import 'server-only';
import sharp, { type Sharp, type Metadata } from 'sharp';
import { createHash } from 'node:crypto';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Where renditions land. Public so Next serves them as static files. */
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const PUBLIC_PREFIX = '/uploads';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MB
const DISPLAY_MAX_EDGE = 1400;
const THUMB_EDGE = 320;

/** Formats a phone camera actually produces, plus the web standards. */
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif',
]);

export class ImageError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ImageError';
  }
}

export interface StoredImage {
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export async function storeMenuImage(
  file: File,
  scope: string,
): Promise<StoredImage> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageError(
      'فقط عکس با فرمت JPG، PNG، WebP یا HEIC پذیرفته می‌شود',
      'UNSUPPORTED_TYPE',
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageError(
      `حجم عکس نباید از ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} مگابایت بیشتر باشد`,
      'TOO_LARGE',
    );
  }

  const input = Buffer.from(await file.arrayBuffer());

  // Decode before trusting anything: a file can claim image/jpeg in its MIME
  // type and be something else entirely. If sharp cannot read it as an image,
  // it does not get written to a public directory.
  let source: Sharp;
  let metadata: Metadata;
  try {
    source = sharp(input, { failOn: 'error' });
    metadata = await source.metadata();
  } catch {
    throw new ImageError('این فایل یک عکس معتبر نیست', 'NOT_AN_IMAGE');
  }
  if (!metadata.width || !metadata.height) {
    throw new ImageError('ابعاد عکس خوانده نشد', 'NO_DIMENSIONS');
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 16);
  const base = `${sanitise(scope)}-${hash}`;

  const display = await sharp(input)
    // Phones record orientation in EXIF rather than rotating the pixels;
    // without this, portrait photos appear sideways.
    .rotate()
    .resize({
      width: DISPLAY_MAX_EDGE,
      height: DISPLAY_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const thumbnail = await sharp(input)
    .rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'cover', position: 'attention' })
    .webp({ quality: 74 })
    .toBuffer();

  await Promise.all([
    writeFile(path.join(UPLOAD_DIR, `${base}.webp`), display.data),
    writeFile(path.join(UPLOAD_DIR, `${base}-thumb.webp`), thumbnail),
  ]);

  return {
    url: `${PUBLIC_PREFIX}/${base}.webp`,
    thumbnailUrl: `${PUBLIC_PREFIX}/${base}-thumb.webp`,
    width: display.info.width,
    height: display.info.height,
    bytes: display.data.length,
  };
}

/**
 * Deletes a stored rendition pair.
 *
 * Refuses any path that is not a plain filename inside the upload directory,
 * so a crafted imageUrl on a menu item cannot be used to delete files
 * elsewhere on disk.
 */
export async function deleteMenuImage(url: string | null): Promise<void> {
  if (!url || !url.startsWith(`${PUBLIC_PREFIX}/`)) return;

  const filename = path.basename(url);
  if (filename !== url.slice(PUBLIC_PREFIX.length + 1)) return;

  const target = path.join(UPLOAD_DIR, filename);
  if (path.dirname(target) !== UPLOAD_DIR) return;

  const thumbnail = target.replace(/\.webp$/, '-thumb.webp');
  await Promise.allSettled([unlink(target), unlink(thumbnail)]);
}

const sanitise = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
