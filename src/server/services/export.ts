/**
 * CSV export.
 *
 * Written by hand rather than pulled from a library because the requirements
 * are specific: Excel must open the file with Persian text intact, which needs
 * a UTF-8 BOM, and every field must be escaped for the RFC 4180 cases that
 * actually occur here — commas inside Persian names, quotes inside notes.
 */
import 'server-only';

export type CsvValue = string | number | null | undefined;

export function toCsv(
  headers: string[],
  rows: CsvValue[][],
): string {
  const escape = (value: CsvValue): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    // Quote when the field contains a delimiter, a quote, or a line break.
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [headers, ...rows].map((row) => row.map(escape).join(','));
  // Excel needs the BOM or it renders Persian as mojibake.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvResponse(filename: string, content: string): Response {
  // HTTP header values are ByteStrings, so a Persian filename cannot go into
  // the plain `filename=` parameter — it throws. RFC 6266 handles exactly this:
  // an ASCII fallback for old clients, plus RFC 5987 `filename*` carrying the
  // real name percent-encoded. Modern browsers prefer the latter and the user
  // gets the Persian name.
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');

  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        `attachment; filename="${asciiFallback}"; ` +
        `filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
