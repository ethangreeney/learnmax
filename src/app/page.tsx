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
  <div className="flex flex-col text-left gap-3 p-5 rounded-lg border border-neutral-800 bg-neutral-900/50 h-full">
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-md bg-neutral-700/50 text-white">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-md font-semibold">{title}</h3>
    </div>
    <p className="text-sm text-neutral-400 leading-relaxed">
      {children}
    </p>
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
      ['/dashboard', '/learn'].forEach((r) => {
        try { router.prefetch(r); } catch {}
      });
    }, [router]);
    return null;
  }
  return (
    <div className="container-narrow" style={{ minHeight: 'calc(100svh - 120px)' }}>
      <PrefetchRoutes />
      <div className="flex flex-col items-center justify-center text-center min-h-[calc(100svh-160px)] max-w-6xl mx-auto">
        <div className="w-full">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-neutral-200 to-neutral-400 leading-[1.18] md:leading-[1.14] lg:leading-[1.12] pb-1.5">
            The Science of Learning, Perfected by AI.
          </h1>
          <p className="mt-4 max-w-3xl mx-auto text-base md:text-lg text-neutral-300">
            Stop wasting hours on inefficient rereading. LearnMax applies proven cognitive science to build a hyper-efficient study path, ensuring you master every concept with minimal time and effort.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
    <Link
      href="/learn"
      className="btn-primary shadow-lg hover:scale-105"
    >
      Optimize Your First Lecture
    </Link>
   
  </div>
        </div>
        <div className="w-full mt-12">
          <div className="grid gap-5 md:grid-cols-3">
            <PillarCard icon={FileSearch} title="AI Deconstruction">
              Our models find the optimal learning path through dense material, so you study the right concepts in the right order.
            </PillarCard>
            <PillarCard icon={BrainCircuit} title="Guided Mastery Learning">
              Based on proven science, you focus on one core idea at a time. This prevents cognitive overload and embeds knowledge effectively.
            </PillarCard>
            <PillarCard icon={Target} title="Verified Comprehension">
              Pass a targeted quiz to prove you&apos;ve mastered the concept. This guarantees a rock-solid foundation for lasting knowledge.
            </PillarCard>
          </div>
        </div>
      </div>
    </div>
  );
}

