/**
 * Menu photo storage.
 *
 * Photos are taken on the owner's phone and uploaded from the gallery, so they
 * arrive as multi-megabyte originals. Every upload is re-encoded before it is
 * kept: resized, converted to WebP, and stripped of EXIF — which matters
 * beyond file size, because phone photos carry GPS coordinates and publishing
 * those on a public menu would leak where the picture was taken.
 *
 * Bytes go into Postgres rather than onto disk. The deployment target is
 * serverless, where the filesystem is read-only and per-instance, so anything
 * written to it either fails outright or disappears. A resized photo is ~100 KB
 * and a restaurant has tens of them; that is far cheaper than standing up an
 * object store. Past a few thousand photos this should move to S3 or Vercel
 * Blob — only this file would change.
 */
import 'server-only';
import sharp, { type Sharp, type Metadata } from 'sharp';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const DISPLAY_MAX_EDGE = 1400;

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

export interface StoredImageResult {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}

export async function storeMenuImage(
  file: File,
  restaurantId: string,
): Promise<StoredImageResult> {
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
  // type and be something else entirely.
  let metadata: Metadata;
  try {
    const source: Sharp = sharp(input, { failOn: 'error' });
    metadata = await source.metadata();
  } catch {
    throw new ImageError('این فایل یک عکس معتبر نیست', 'NOT_AN_IMAGE');
  }
  if (!metadata.width || !metadata.height) {
    throw new ImageError('ابعاد عکس خوانده نشد', 'NO_DIMENSIONS');
  }

  const rendition = await sharp(input)
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

  const hash = createHash('sha256').update(rendition.data).digest('hex').slice(0, 32);

  // Re-uploading the same photo reuses the row rather than duplicating bytes.
  const stored = await prisma.storedImage.upsert({
    where: { restaurantId_hash: { restaurantId, hash } },
    update: {},
    create: {
      restaurantId,
      hash,
      data: rendition.data,
      contentType: 'image/webp',
      width: rendition.info.width,
      height: rendition.info.height,
      bytes: rendition.data.length,
    },
  });

  return {
    id: stored.id,
    url: `/api/images/${stored.id}`,
    width: stored.width,
    height: stored.height,
    bytes: stored.bytes,
  };
}

/**
 * Deletes a stored photo, given the URL held on the menu item.
 *
 * Only ids produced by this module are acted on; anything else is ignored, so
 * a crafted imageUrl cannot be used to delete arbitrary rows.
 */
export async function deleteMenuImage(url: string | null): Promise<void> {
  const id = imageIdFromUrl(url);
  if (!id) return;
  await prisma.storedImage.deleteMany({ where: { id } });
}

export function imageIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = /^\/api\/images\/([A-Za-z0-9_-]{1,64})$/.exec(url);
  return match ? match[1] : null;
}
