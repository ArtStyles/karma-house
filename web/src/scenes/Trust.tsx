import { ShieldCheck } from 'lucide-react';
import { TRUST } from '../content';
import { Eyebrow, Reveal, Stagger, StaggerItem, WRAP } from '../ui';

export function Trust() {
  return (
    <section className="py-20 lg:py-28" aria-labelledby="trust-title">
      <div className={WRAP}>
        <div className="relative grid gap-12 overflow-hidden rounded-[40px] border border-line bg-paper p-7 sm:p-12 lg:grid-cols-[.9fr_1.1fr] lg:p-16">
          <div className="losa absolute inset-0 text-ocre opacity-[.06]" aria-hidden="true" />
          <Reveal className="relative">
            <span className="grid size-12 place-items-center rounded-2xl bg-persiana/10 text-persiana"><ShieldCheck className="size-6" aria-hidden="true" /></span>
            <div className="mt-7"><Eyebrow className="text-persiana">Más claridad, desde el inicio</Eyebrow></div>
            <h2 id="trust-title" className="mt-5 text-[clamp(2.1rem,4vw,3.2rem)]">Tu confianza<br /><span className="text-blue">también tiene su lugar.</span></h2>
            <p className="mt-5 max-w-[22rem] text-[15px] leading-relaxed text-body">Herramientas para compartir lo necesario y mantener el control de tu experiencia.</p>
          </Reveal>
          <Stagger className="relative grid gap-3">
            {TRUST.map(([title, text], i) => (
              <StaggerItem key={title} as="article" className="flex gap-5 rounded-3xl bg-cal p-6">
                <span className="pt-0.5 font-display text-lg text-persiana">0{i + 1}</span>
                <div><h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-body">{text}</p></div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
