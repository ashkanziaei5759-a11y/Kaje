import { prisma } from '@/lib/db';

/**
 * Serves a stored menu photo.
 *
 * Public and uncredentialed on purpose — these appear on the public menu. The
 * bytes are immutable for a given id (the id is derived from a content hash),
 * so they can be cached hard and forever; replacing a dish's photo produces a
 * new id rather than new bytes at the same URL.
 */
export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const image = await prisma.storedImage.findUnique({
    where: { id },
    select: { data: true, contentType: true, bytes: true },
  });
  if (!image) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(image.data), {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.bytes),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
