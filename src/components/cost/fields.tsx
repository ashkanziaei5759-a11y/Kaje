'use client';

import { useId, type ReactNode } from 'react';
import { faDigits } from '@/lib/format';

/**
 * Form primitives for the cost builder.
 *
 * Three rules are baked in rather than left to each call site:
 *  - the label is always visible above the control, never a placeholder
 *    standing in for one (a placeholder disappears the moment you type, and
 *    with it any record of what the field was);
 *  - errors render directly beneath the field they belong to and are wired
 *    with aria-describedby, so a screen reader announces the problem with the
 *    field rather than as loose text elsewhere on the page;
 *  - numeric fields carry inputmode so phones raise a number pad.
 */

export function Field({
  label, hint, error, children, htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-2xs font-medium text-ink-600">
        {label}
      </label>
      {children}
      {/* The hint stays put when an error appears. An error says what is wrong;
          the hint says what the field means, and that is precisely what someone
          who just got it wrong still needs to read. */}
      {hint ? <p className="mt-1 text-2xs leading-5 text-ink-600">{hint}</p> : null}
      {error ? <p className="mt-1 text-2xs font-medium text-pomegranate-400">{error}</p> : null}
    </div>
  );
}

export function NumberField({
  label, value, onChange, hint, error, suffix, step = 'any', min = 0, disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
  step?: string;
  min?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          dir="ltr"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`tabular h-11 w-full rounded-lg border bg-ink-100 px-3 text-left text-sm
            text-ink-900 transition-colors focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-0 focus:outline-none disabled:opacity-50
            ${error ? 'border-pomegranate-500' : 'border-ink-300 focus:border-forest-500'}
            ${suffix ? 'pl-14' : ''}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-2xs text-ink-600">
            {suffix}
          </span>
        )}
      </div>
      {error && <span id={errorId} className="sr-only">{error}</span>}
    </Field>
  );
}

/**
 * Percentages are stored as fractions but nobody thinks in fractions. This
 * shows 30 and stores 0.3, so a manager never has to convert in their head —
 * a place people reliably get wrong by a factor of a hundred.
 */
export function PercentField({
  label, value, onChange, hint, error, max = 99.99,
}: {
  label: string;
  value: string;
  onChange: (fraction: string) => void;
  hint?: ReactNode;
  error?: string | null;
  max?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const shown = value === '' ? '' : String(Math.round(Number(value) * 10000) / 100);

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          max={max}
          dir="ltr"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') { onChange(''); return; }
            onChange(String(Number(raw) / 100));
          }}
          className={`tabular h-11 w-full rounded-lg border bg-ink-100 pl-8 pr-3 text-left text-sm
            text-ink-900 transition-colors focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-0 focus:outline-none
            ${error ? 'border-pomegranate-500' : 'border-ink-300 focus:border-forest-500'}`}
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-2xs text-ink-600">
          ٪
        </span>
      </div>
      {error && <span id={errorId} className="sr-only">{error}</span>}
    </Field>
  );
}

export function SelectField({
  label, value, onChange, options, hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-ink-300 bg-ink-100 px-3 text-sm
                   text-ink-900 focus:border-forest-500 focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-0 focus:outline-none"
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
    </Field>
  );
}

/** Before → after, with the direction of travel coloured. */
export function Delta({
  from, to, format, invert = false,
}: {
  from: string | number;
  to: string | number;
  format: (v: string | number) => string;
  /** When true, a rise is bad (costs); when false, a rise is good (margin). */
  invert?: boolean;
}) {
  const a = Number(from);
  const b = Number(to);
  const changed = Math.abs(b - a) > 0.0001;
  if (!changed) return <span className="tabular text-ink-800">{format(to)}</span>;

  const rose = b > a;
  const good = invert ? !rose : rose;

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="tabular text-2xs text-ink-400 line-through">{format(from)}</span>
      <span className={`tabular font-semibold ${good ? 'text-pistachio-400' : 'text-pomegranate-400'}`}>
        {format(to)}
      </span>
    </span>
  );
}

export function Num({ children }: { children: string | number }) {
  return <span className="tabular">{faDigits(children)}</span>;
}

export function TextField({
  label, value, onChange, hint, error, placeholder, dir, type = 'text', disabled, required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
  dir?: 'rtl' | 'ltr';
  type?: 'text' | 'email' | 'tel' | 'date';
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        type={type}
        dir={dir ?? (type === 'text' ? 'rtl' : 'ltr')}
        className="input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  label, value, onChange, hint, rows = 2, placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        className="input resize-y"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
