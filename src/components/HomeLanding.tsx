'use client';

import Link from 'next/link';
import { BrainCircuit, Target, FileSearch, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ElementType, ReactNode } from 'react';

const PillarCard = ({
  icon: Icon,
  title,
  children,
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
}) => (
  <div className="group card relative flex h-full flex-col gap-3 rounded-xl border border-neutral-800/70 bg-neutral-900/50 p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition duration-300 hover:-translate-y-0.5 hover:border-neutral-700 hover:bg-neutral-900">
    <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 ring-1 ring-emerald-500/10 transition group-hover:opacity-100" />
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-neutral-800/70 text-white ring-1 ring-neutral-700/60">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
    </div>
    <p className="text-sm leading-relaxed text-neutral-400">{children}</p>
  </div>
);

function HeroBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="hero-spotlight absolute top-[-30%] left-1/2 h-[120vmax] w-[120vmax] -translate-x-1/2" />
      <div className="hero-grid absolute inset-0" />
      <div className="absolute top-[15%] left-[10%] h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute top-[30%] right-[8%] h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
    </div>
  );
}

export default function HomeLanding() {
  useEffect(() => {
    const prev = document.body.getAttribute('data-page');
    document.body.setAttribute('data-page', 'home');
    return () => {
      if (prev) document.body.setAttribute('data-page', prev);
      else document.body.removeAttribute('data-page');
    };
  }, []);

  function PrefetchRoutes() {
    const router = useRouter();
    useEffect(() => {
      ['/dashboard', '/learn', '/example'].forEach((r) => {
        try {
          router.prefetch(r);
        } catch {}
      });
    }, [router]);
    return null;
  }

  return (
    <div className="container-narrow relative">
      <HeroBackground />
      <PrefetchRoutes />
      <div className="mx-auto flex min-h-[calc(100vh-200px)] max-w-6xl flex-col items-center justify-center text-center">
        <div className="w-full">
          <h1 className="bg-gradient-to-b from-white via-neutral-200 to-neutral-400 bg-clip-text pb-2 text-4xl leading-[1.06] font-semibold tracking-tight text-transparent md:text-6xl lg:text-7xl">
            The science of learning, accelerated by AI.
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base text-neutral-300 md:text-lg">
            Skip the rereads. LearnMax builds a focused path and verifies
            mastery so you truly remember.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/learn"
              className="btn-primary btn-xl relative shadow-lg ring-1 ring-emerald-400/20 hover:scale-105"
            >
              Create a lesson
              <ChevronRight className="ml-0.5 h-4 w-4" />
            </Link>
            <Link
              href="/example"
              className="btn-ghost border border-neutral-700 hover:border-neutral-500"
            >
              View example lesson
            </Link>
          </div>
        </div>
        <div className="mt-12 w-full">
          <div className="grid gap-5 md:grid-cols-3">
            <PillarCard icon={FileSearch} title="AI Deconstruction">
              LearnMax turns dense material into a clear sequence of focused
              concepts.
            </PillarCard>
            <PillarCard icon={BrainCircuit} title="Guided Mastery Learning">
              Based on proven science, you focus on one core idea at a time.
              This prevents cognitive overload and embeds knowledge effectively.
            </PillarCard>
            <PillarCard icon={Target} title="Verified Comprehension">
              Pass a targeted quiz to prove you&apos;ve mastered the concept.
              Each check reveals what is solid and what needs another pass.
            </PillarCard>
          </div>
        </div>
      </div>
    </div>
  );
}
