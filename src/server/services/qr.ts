/**
 * QR code generation for the public menu.
 *
 * Generated server-side as SVG and PNG data URIs so the printable asset is
 * identical to what the browser shows, and so a restaurant with no internet in
 * the print shop can still take the file.
 *
 * The QR encodes a token-bearing URL. Regenerating the token invalidates every
 * previously printed code — which is the point: a code that leaks, or a menu
 * moved to a new address, must be revocable.
 */
import 'server-only';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';

export function menuUrl(token: string, targetPath = '/menu'): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${targetPath}?c=${token}`;
}

const QR_OPTIONS = {
  errorCorrectionLevel: 'M' as const,
  margin: 2,
  // Ink on white: a QR printed on a dark background fails on many scanners.
  color: { dark: '#0B0E13', light: '#FFFFFF' },
};

export async function renderQr(token: string, targetPath: string) {
  const url = menuUrl(token, targetPath);
  const [svg, png] = await Promise.all([
    QRCode.toString(url, { ...QR_OPTIONS, type: 'svg', width: 512 }),
    QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1024 }),
  ]);
  return { url, svg, png };
}

/** Returns the restaurant's QR row, creating one on first use. */
export async function getOrCreateQrCode(restaurantId: string) {
  const existing = await prisma.qRCode.findFirst({
    where: { restaurantId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;

  return prisma.qRCode.create({
    data: {
      restaurantId,
      token: randomBytes(16).toString('hex'),
      targetPath: '/menu',
    },
  });
}

/**
 * Issues a new token. The previous code is deactivated rather than deleted, so
 * the scan history of retired codes survives for reporting.
 */
export async function regenerateQrCode(restaurantId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.qRCode.updateMany({
      where: { restaurantId, isActive: true },
      data: { isActive: false },
    });
    return tx.qRCode.create({
      data: {
        restaurantId,
        token: randomBytes(16).toString('hex'),
        targetPath: '/menu',
      },
    });
  });
}
