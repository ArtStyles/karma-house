// An illustrative seaside barrio seen from above. No street names: it is not a real address.
const BLOCKS = Array.from({ length: 14 * 9 }, (_, k) => {
  const r = Math.floor(k / 9), c = k % 9;
  return { x: c * 44 - 40, y: r * 44 + 70, park: (r === 7 && c === 4) || (r === 3 && c === 2), alt: (r * 3 + c) % 5 === 0 };
});

/** Pin positions as [left %, top %] of the map layer. HOUSE_PIN is the house from the hero photo. */
export const PINS: readonly (readonly [number, number])[] = [[28, 34], [74, 30], [44, 47], [62, 58], [24, 68], [80, 70], [52, 80]];
export const HOUSE_PIN = 3;

export function Barrio() {
  return (
    <svg viewBox="0 0 300 640" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
      <rect width="300" height="640" fill="#F6F1E7" />
      <g transform="rotate(-11 150 330)">
        {BLOCKS.map(({ x, y, park, alt }) => <rect key={`${x},${y}`} x={x} y={y} width="36" height="36" rx="4" fill={park ? '#D5E4D0' : alt ? '#E3D7C2' : '#E9DFCD'} />)}
        {BLOCKS.filter((b) => b.park).flatMap(({ x, y }) => [0, 1, 2, 3, 4].map((t) => (
          <circle key={`${x},${y},${t}`} cx={x + 7 + ((t * 13) % 24)} cy={y + 8 + t * 6} r="3.6" fill="#B5CFAE" />
        )))}
        <circle cx="186" cy="312" r="15" fill="#F6F1E7" /><circle cx="186" cy="312" r="8" fill="#D5E4D0" />
      </g>
      <path d="M-30 600 L330 250" stroke="#fff" strokeWidth="12" />
      <path d="M-30 600 L330 250" stroke="#F6F1E7" strokeWidth="2" strokeDasharray="6 8" />
      <path d="M0 0H300V70Q250 96 190 82T80 92T0 76Z" fill="#CFE0EE" />
      <path d="M0 76Q40 92 80 92T190 82T300 70" fill="none" stroke="#fff" strokeWidth="7" />
      <path d="M20 30q20-8 40 0t40 0M150 22q20-8 40 0t40 0M90 52q20-8 40 0t40 0" fill="none" stroke="#E4EEF7" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function PinIcon({ house = false }: { house?: boolean }) {
  return (
    <svg viewBox="0 0 24 30" className="block w-full drop-shadow-[0_3px_3px_rgba(0,0,0,.18)]">
      <path d="M12 29s9-9.5 9-17A9 9 0 0 0 3 12c0 7.5 9 17 9 17z" fill={house ? '#A84C33' : '#0153A8'} /><circle cx="12" cy="12" r="4.2" fill="#fff" />
    </svg>
  );
}
