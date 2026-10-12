import { Fragment } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { CONTACT, FAQ, type Part } from '../content';
import { ARROW, Eyebrow, LINK, Reveal, WRAP } from '../ui';

function Answer({ parts }: { parts: Part[] }) {
  return <>{parts.map((p, i) => <Fragment key={i}>{typeof p === 'string' ? p : <a href={p.href}>{p.text}</a>}</Fragment>)}</>;
}

export function Questions() {
  return (
    <section className="pb-24 lg:pb-32" id="preguntas" aria-labelledby="questions-title">
      <div className={`${WRAP} grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20`}>
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>Antes de empezar</Eyebrow>
          <h2 id="questions-title" className="mt-5 text-[clamp(2.1rem,4vw,3.2rem)]">Buenas preguntas.<br /><span className="text-blue">Respuestas claras.</span></h2>
          <p className="mt-5 text-[15px] text-body">Lo esencial sobre KarmaHouse, tu cuenta y la instalación.</p>
          <a className={`${LINK} mt-4 text-blue!`} href={CONTACT}>Escríbenos si necesitas ayuda <ArrowRight className={ARROW} aria-hidden="true" /></a>
        </Reveal>
        <Reveal delay={0.1} className="faq border-t border-line">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group border-b border-line">
              <summary className="flex min-h-16 items-center justify-between gap-6 py-4 text-[15px] font-semibold transition-colors hover:text-blue">
                {q}<span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-blue transition-transform duration-300 group-open:rotate-45"><Plus className="size-4" aria-hidden="true" /></span>
              </summary>
              <p className="pb-6 pr-12 text-[15px] leading-relaxed text-body [&_a]:text-blue [&_a]:underline [&_a]:underline-offset-4"><Answer parts={a} /></p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
