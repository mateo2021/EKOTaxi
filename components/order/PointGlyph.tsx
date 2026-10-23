export type PointKind = 'start' | 'end'

/** Znak punktu — ten sam co znacznik na mapie (kółko = odbiór, kwadrat = cel). */
export function PointGlyph({ kind, className = '' }: { kind: PointKind; className?: string }) {
  return kind === 'start' ? (
    <span aria-hidden="true" className={`block size-3.5 rounded-full border-[3.5px] border-accent bg-surface ${className}`} />
  ) : (
    <span aria-hidden="true" className={`grid size-3.5 place-items-center rounded-[3px] bg-text ${className}`}>
      <span className="size-1 rounded-[1px] bg-surface" />
    </span>
  )
}
