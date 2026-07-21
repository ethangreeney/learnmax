import type { SVGProps } from 'react';

type GlyphProps = SVGProps<SVGSVGElement>;

/** A quiet content mark: source lines without the familiar "document" outline. */
export function SourceLinesGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M3.5 5.25h8M3.5 10h13M3.5 14.75h9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="15.25" cy="5.25" r="1.25" fill="currentColor" />
    </svg>
  );
}

/** A compact lesson-outline mark used wherever a saved lesson is represented. */
export function LessonOutlineGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M7.5 5h9M7.5 10h6.5M7.5 15h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="3.75" cy="5" r="1.15" fill="currentColor" />
      <circle cx="3.75" cy="10" r="1.15" fill="currentColor" opacity=".72" />
      <circle cx="3.75" cy="15" r="1.15" fill="currentColor" opacity=".46" />
    </svg>
  );
}

/** Optically centred for square action buttons; avoids the low-set trash glyph. */
export function DeleteGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M6.25 6.5v8c0 .83.67 1.5 1.5 1.5h4.5c.83 0 1.5-.67 1.5-1.5v-8M4.75 5h10.5M8 5V3.75h4V5M8.5 8.5v4.75M11.5 8.5v4.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
