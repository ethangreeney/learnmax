'use client';

import Link from 'next/link';
import { BrainCircuit, Target, FileSearch } from 'lucide-react';

// A highly compact component for highlighting the core pillars.
const PillarCard = ({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => (
  // 'h-full' ensures all cards have the same height, creating a clean row.
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
  return (
    // This container uses flexbox and a calculated height to fill the viewport
    // between the header and footer, preventing any page scroll.
    // 'justify-center' vertically aligns the content block.
    <div className="flex flex-col items-center justify-center text-center h-[calc(100vh-180px)] max-w-6xl mx-auto">
      
      {/* --- Main Content Block --- */}
      <div className="w-full">
        {/* --- Authoritative Headline & Enriched Subheading --- */}
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-neutral-300">
          The Science of Learning, Perfected by AI.
        </h1>
        <p className="mt-4 max-w-3xl mx-auto text-base md:text-lg text-neutral-300">
          Stop wasting hours on inefficient rereading. LearnMax applies proven cognitive science to build a hyper-efficient study path, ensuring you master every concept with minimal time and effort.
        </p>
        
        {/* --- Powerful & Confident CTA --- */}
        <div className="mt-8">
          <Link
            href="/learn"
            className="inline-flex items-center gap-3 rounded-md bg-white px-6 py-3 text-base text-black font-semibold shadow-lg transition-transform hover:scale-105"
          >
            Optimize Your First Lecture
          </Link>
        </div>
      </div>

      {/* --- Integrated Methodology Section (Reduced top margin to fit) --- */}
      <div className="w-full mt-12">
        <div className="grid gap-5 md:grid-cols-3">
          <PillarCard icon={FileSearch} title="AI Deconstruction">
            Our models find the optimal learning path through dense material, so you study the right concepts in the right order.
          </PillarCard>
          <PillarCard icon={BrainCircuit} title="Guided Mastery Learning">
            Based on proven science, you focus on one core idea at a time. This prevents cognitive overload and embeds knowledge effectively.
          </PillarCard>
          <PillarCard icon={Target} title="Verified Comprehension">
            Pass a targeted quiz to prove you've mastered the concept. This guarantees a rock-solid foundation for lasting knowledge.
          </PillarCard>
        </div>
      </div>
    </div>
  );
}
