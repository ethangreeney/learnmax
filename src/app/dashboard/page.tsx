'use client';

import Link from 'next/link';
import { useProgressStore } from '@/lib/store';
import { BookOpen, Target, BrainCircuit, Flame } from 'lucide-react';

// A reusable component for a single statistic card on the dashboard.
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">{label}</span>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <p className="text-4xl font-bold">{value}</p>
    </div>
  );
}

// A placeholder for a recent topic card.
function RecentTopicCard({ topic }: { topic: { title: string; lastStudied: string } }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 flex items-center justify-between hover:bg-neutral-800/50 transition-colors">
      <div>
        <h4 className="font-semibold">{topic.title}</h4>
        <p className="text-sm text-neutral-400">Last studied: {topic.lastStudied}</p>
      </div>
      <Link href="/learn" className="text-sm font-medium text-white hover:underline">
        Review
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const { progress } = useProgressStore();

  // Placeholder data for recent topics. This could come from your store in the future.
  const recentTopics = [
    { title: 'Introduction to Sorting Algorithms', lastStudied: 'Yesterday' },
    { title: 'Data Structures: Trees and Graphs', lastStudied: '3 days ago' },
  ];

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Your Dashboard</h1>
        <p className="text-neutral-400 mt-2">
          Welcome back! Here's a summary of your learning journey.
        </p>
      </header>

      {/* Main grid for stats and a call to action */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <StatCard
            label="Lectures Completed"
            value={progress.completedLectures}
            icon={BookOpen}
            color="text-blue-400"
          />
          <StatCard
            label="Subtopics Mastered"
            value={progress.masteredSubtopics}
            icon={Target}
            color="text-green-400"
          />
          <StatCard
            label="Learning Elo"
            value={progress.elo}
            icon={BrainCircuit}
            color="text-purple-400"
          />
          <StatCard
            label="Current Streak"
            value={`${progress.streak} days`}
            icon={Flame}
            color="text-orange-400"
          />
        </div>

        {/* Call-to-action card */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 flex flex-col items-center justify-center text-center gap-4">
          <h3 className="text-xl font-semibold">Ready to Learn?</h3>
          <p className="text-neutral-400 text-sm">
            Dive into your next topic or upload new material to get started.
          </p>
          <Link
            href="/learn"
            className="w-full rounded-md bg-white px-6 py-3 text-black font-semibold shadow-md transition-transform hover:scale-105"
          >
            Go to Workspace
          </Link>
        </div>
      </section>

      {/* Section for recent topics */}
      <section>
        <h2 className="text-2xl font-semibold">Recent Topics</h2>
        <div className="mt-6 space-y-4">
          {recentTopics.map((topic, index) => (
            <RecentTopicCard key={index} topic={topic} />
          ))}
        </div>
      </section>
    </div>
  );
}
