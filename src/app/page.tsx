'use client';

import Link from 'next/link';
import { BrainCircuit, Target, FileSearch } from 'lucide-react';

// A component for highlighting core methodological pillars.
const PillarCard = ({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col items-start text-left gap-4 p-6 rounded-lg border border-neutral-800 bg-neutral-900/50">
    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral-800 text-white">
      <Icon className="w-6 h-6" />
    </div>
    <h3 className="text-xl font-semibold mt-2">{title}</h3>
    <p className="text-base text-neutral-400 leading-relaxed">
      {children}
    </p>
  </div>
);

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 md:py-20">
      
      {/* --- Authoritative Headline & Subheading --- */}
      <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-neutral-300">
        The Science of Learning, Perfected by AI.
      </h1>
      <p className="mt-6 max-w-3xl text-lg md:text-xl text-neutral-300">
        LearnMax merges proven cognitive science with state-of-the-art AI. We transform your dense study materials into a dynamic, mastery-based learning path—the most efficient route to not just memorization, but true comprehension and top grades.
      </p>
      
      {/* --- Powerful & Confident CTA --- */}
      <div className="mt-10">
        <Link
          href="/learn"
          className="inline-flex items-center gap-3 rounded-md bg-white px-8 py-4 text-lg text-black font-semibold shadow-xl transition-all duration-300 ease-in-out hover:scale-105 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-950 focus:ring-white"
        >
          Optimize Your First Lecture Now
        </Link>
      </div>

      {/* --- Section on the Scientific Methodology --- */}
      <div className="mt-28 w-full max-w-5xl">
        <h2 className="text-3xl font-semibold mb-12">The LearnMax Methodology: A Superior Approach</h2>
        <div className="grid gap-8 md:grid-cols-3">
          <PillarCard icon={FileSearch} title="1. AI-Powered Deconstruction">
            Our AI doesn't just read; it deconstructs your content based on core principles, identifying key concepts and their relationships to build an optimal learning sequence.
          </PillarCard>
          <PillarCard icon={BrainCircuit} title="2. Guided Mastery Learning">
            Engage with material one concept at a time. This scientifically-validated method ensures each piece of knowledge is fully encoded before you build upon it.
          </PillarCard>
          <PillarCard icon={Target} title="3. Verify Comprehension & Advance">
            Confirm your understanding with targeted micro-quizzes. You only advance once mastery is proven, guaranteeing a rock-solid foundation with no knowledge gaps.
          </PillarCard>
        </div>
      </div>
    </div>
  );
}
