// Schematyczna mapa miasta pod arkuszem logowania. Czysta dekoracja (aria-hidden).
const MAIN_ROADS = [
  'M-20 300 C 300 280, 520 340, 1220 250',
  'M420 -20 C 440 260, 380 520, 470 820',
  'M-20 620 L 1220 560',
  'M900 -20 C 860 300, 960 520, 900 820',
]

const STREETS = [
  'M-20 120 L 1220 90',
  'M-20 460 L 1220 420',
  'M-20 740 L 1220 700',
  'M180 -20 L 220 820',
  'M640 -20 L 670 820',
  'M1100 -20 L 1080 820',
  'M520 300 L 760 120',
  'M300 460 L 470 620',
]

export function CityMap() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-[45dvh] w-full md:inset-y-0 md:h-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="1200" height="800" className="fill-bg" />
      <path d="M690 150 L 860 140 L 880 260 L 700 280 Z" className="fill-accent opacity-15" />
      <path d="M200 480 L 400 470 L 410 590 L 215 605 Z" className="fill-accent opacity-10" />
      <g fill="none" strokeLinecap="round">
        {STREETS.map((d) => (
          <path key={d} d={d} className="stroke-border" strokeWidth={10} />
        ))}
        {MAIN_ROADS.map((d) => (
          <path key={d} d={d} className="stroke-border" strokeWidth={26} />
        ))}
        {MAIN_ROADS.map((d) => (
          <path key={`${d}-in`} d={d} className="stroke-surface" strokeWidth={18} />
        ))}
        <path
          d="M535 335 C 560 300, 600 300, 640 300 C 660 300, 668 250, 665 200 C 663 160, 700 135, 755 130"
          pathLength={1}
          className="route-draw stroke-accent"
          strokeWidth={7}
          strokeLinejoin="round"
        />
      </g>
      <circle cx="535" cy="335" r="13" className="fill-surface stroke-accent" strokeWidth={6} />
      <rect x="742" y="117" width="26" height="26" rx="5" className="fill-text" />
      <rect x="750" y="125" width="10" height="10" rx="2" className="fill-surface" />
    </svg>
  )
}
