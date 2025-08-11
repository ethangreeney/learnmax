'use client';

import Link from 'next/link';
import { BrainCircuit, Target, FileSearch } from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const PillarCard = ({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex h-full flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 text-left">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-neutral-700/50 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-md font-semibold">{title}</h3>
    </div>
    <p className="text-sm leading-relaxed text-neutral-400">{children}</p>
  </div>
);

export default function HomePage() {
  // Prevent body scroll while on home page
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
    <div
      className="container-narrow"
      style={{ minHeight: 'calc(100svh - 120px)' }}
    >
      <PrefetchRoutes />
      <div className="mx-auto flex min-h-[calc(100svh-160px)] max-w-6xl flex-col items-center justify-center text-center">
        <div className="w-full">
          <h1 className="bg-gradient-to-b from-white via-neutral-200 to-neutral-400 bg-clip-text pb-1.5 text-4xl leading-[1.18] font-bold tracking-tight text-transparent md:text-5xl md:leading-[1.14] lg:leading-[1.12]">
            The Science of Learning, Perfected by AI.
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base text-neutral-300 md:text-lg">
            Stop wasting hours on inefficient rereading. LearnMax applies proven
            cognitive science to build a hyper-efficient study path, ensuring
            you master every concept with minimal time and effort.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/learn"
              className="btn-primary shadow-lg hover:scale-105"
            >
              Optimize Your First Lecture
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
              Our models find the optimal learning path through dense material,
              so you study the right concepts in the right order.
            </PillarCard>
            <PillarCard icon={BrainCircuit} title="Guided Mastery Learning">
              Based on proven science, you focus on one core idea at a time.
              This prevents cognitive overload and embeds knowledge effectively.
            </PillarCard>
            <PillarCard icon={Target} title="Verified Comprehension">
              Pass a targeted quiz to prove you&apos;ve mastered the concept.
              This guarantees a rock-solid foundation for lasting knowledge.
            </PillarCard>
          </div>
        </div>
      </div>
    </div>
  );
}
