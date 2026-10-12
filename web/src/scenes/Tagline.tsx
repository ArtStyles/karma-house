import { useCallback, useRef, type CSSProperties } from 'react';
import { TAGLINE } from '../content';
import { fade, useMode, useParts, useStage } from '../motion';
import { easeOut, seg } from '../scroll';

const COUNT = TAGLINE.flat().length;
// The lowest opacity that keeps 3:1 contrast for large text in both themes (blue on cal is the tightest).
const DIM = 0.62;

/** «Un espacio para encontrar tu lugar.» Each word goes from dimmed to full colour, in reading order, with the scroll. */
export function Tagline() {
  const track = useRef<HTMLElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);

  const frame = useCallback((p: number) => {
    if (still(mode.current === 'static')) return;
    for (let i = 0; i < COUNT; i++) {
      const a = 0.12 + (i * 0.6) / COUNT;
      fade(parts.current[`w${i}`], DIM + (1 - DIM) * easeOut(seg(p, a, a + 0.6 / COUNT)));
    }
  }, [mode, parts, still]);

  useStage(track, frame);

  let k = 0;
  return (
    <section ref={track} className="tagline track" style={{ '--screens': 1.6 } as CSSProperties} aria-labelledby="tagline-title">
      <div className="stage">
        <h2 id="tagline-title" className="mx-auto max-w-[15ch] px-4 text-center text-[clamp(2.8rem,8vw,6.6rem)] leading-[1.02]">
          {TAGLINE.map((line, l) => (
            <span key={l} className="block">
              {line.map(([word, blue]) => {
                const i = k++;
                return <span key={i} className={`tagline-word${blue ? ' text-blue' : ''}`} data-part={`w${i}`}>{word} </span>;
              })}
            </span>
          ))}
        </h2>
      </div>
    </section>
  );
}
