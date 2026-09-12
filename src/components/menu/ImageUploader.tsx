'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Photo picker for a menu item.
 *
 * The file input carries `accept="image/*"` and deliberately NOT `capture`.
 * Adding capture forces the camera open and removes the gallery option
 * entirely — the owner wants to upload photos already taken, so the picker has
 * to offer the library. Without capture, a phone shows the full sheet: photo
 * library, take a photo, or browse files.
 *
 * A local preview is shown from the chosen file before the upload finishes, so
 * the picture appears instantly rather than after a 10 MB round trip.
 */
export function ImageUploader({
  menuItemId, itemName, currentImageUrl, canEdit,
}: {
  menuItemId: string;
  itemName: string;
  currentImageUrl: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = preview ?? currentImageUrl;

  async function upload(file: File) {
    setError(null);
    setBusy(true);

    // Show the picture immediately from the local file.
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    const body = new FormData();
    body.append('image', file);

    try {
      const response = await fetch(`/api/menu-items/${menuItemId}/image`, { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? 'بارگذاری انجام نشد');
        setPreview(null);
        return;
      }
      // Swap the local preview for the stored, re-encoded rendition.
      setPreview(payload.url);
      router.refresh();
    } catch {
      setError('ارتباط با سرور برقرار نشد');
      setPreview(null);
    } finally {
      URL.revokeObjectURL(objectUrl);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    if (!confirm(`عکس «${itemName}» حذف شود؟`)) return;
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/menu-items/${menuItemId}/image`, { method: 'DELETE' });
    setBusy(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? 'حذف انجام نشد');
      return;
    }
    setPreview(null);
    router.refresh();
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="relative grid size-20 shrink-0 place-items-center overflow-hidden
                   rounded-xl border border-ink-300 bg-ink-100"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URLs and
          // user uploads bypass the image optimiser; these are already resized.
          <img src={shown} alt={`عکس ${itemName}`} className="size-full object-cover" />
        ) : (
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
            className="size-7 text-ink-400" aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17" />
          </svg>
        )}

        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-ink-50/70 text-2xs text-forest-500">
            …
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          id={`image-${menuItemId}`}
          type="file"
          // No `capture` attribute on purpose — it would force the camera and
          // hide the photo library.
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          className="sr-only"
          disabled={!canEdit || busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />

        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={`image-${menuItemId}`}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4
                        text-2xs font-semibold transition-colors
                        ${canEdit && !busy
                          ? 'bg-forest-500 text-ink-50 hover:bg-forest-400'
                          : 'cursor-not-allowed bg-ink-200 text-ink-600'}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                 strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
              <path d="M12 16V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            {busy ? 'در حال بارگذاری…' : shown ? 'تغییر عکس' : 'انتخاب عکس از گالری'}
          </label>

          {shown && canEdit && !busy && (
            <button
              onClick={remove}
              className="min-h-11 rounded-xl border border-ink-300 px-3 text-2xs text-ink-600
                         transition-colors hover:border-pomegranate-500 hover:text-pomegranate-400"
            >
              حذف
            </button>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-1.5 text-2xs text-pomegranate-400">{error}</p>
        ) : (
          <p className="mt-1.5 text-2xs leading-5 text-ink-600">
            از گالری گوشی یا دوربین. عکس خودکار فشرده و بهینه می‌شود — حداکثر ۱۲ مگابایت.
          </p>
        )}
      </div>
    </div>
  );
}
