import Image from 'next/image';
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';

function getRankColor(slug?: string | null): string {
    switch (slug) {
        case 'bronze':
            return 'from-amber-600 via-orange-500 to-yellow-500';
        case 'silver':
            return 'from-gray-400 via-gray-300 to-gray-200';
        case 'gold':
            return 'from-yellow-400 via-yellow-300 to-amber-300';
        case 'diamond':
            return 'from-cyan-400 via-blue-400 to-indigo-400';
        case 'master':
            return 'from-purple-400 via-pink-400 to-rose-400';
        default:
            return 'from-neutral-300 via-neutral-200 to-neutral-100';
    }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params;
    const uname = decodeURIComponent(username || '').toLowerCase();
    if (!uname) notFound();

    const user = await prisma.user.findFirst({
        where: { username: uname },
        select: { id: true, name: true, username: true, bio: true, image: true, elo: true, _count: { select: { masteredSubtopics: true } } },
    });
    if (!user) notFound();

    const rank = await prisma.rank.findFirst({ where: { minElo: { lte: user.elo } }, orderBy: { minElo: 'desc' } });
    const rankColor = getRankColor(rank?.slug);

    return (
        <div className="container-narrow space-y-10">
            <section className="relative overflow-hidden card">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-transparent" />
                <div className="p-5 md:p-6 pb-8 md:pb-10">
                    <div className="flex items-center gap-4">
                        <div className="h-20 w-20 rounded-full ring-2 ring-neutral-800 overflow-hidden bg-neutral-900">
                            {user.image ? (
                                <Image src={user.image} alt={user.name || ''} width={80} height={80} className="h-full w-full object-cover" />
                            ) : (
                                <div className="h-full w-full" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{user.name || 'User'}</h1>
                                <span className={`inline-flex items-center gap-2 rounded-full bg-neutral-900/70 ring-1 ring-neutral-800 px-3 py-1 text-xs`}>
                                    {rank?.iconUrl && (
                                        <Image src={rank.iconUrl} alt={rank.name} width={16} height={16} className="h-4 w-4 object-contain" />
                                    )}
                                    <span className={`bg-gradient-to-r ${rankColor} bg-clip-text text-transparent font-semibold`}>
                                        {rank?.name || 'Unranked'}
                                    </span>
                                    <span className="text-neutral-400">Elo {user.elo}</span>
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-neutral-400">{user.username ? `@${user.username}` : '—'}</p>
                        </div>
                    </div>
                </div>
            </section>

            {user.bio && (
                <section className="card p-6">
                    <h2 className="text-xl font-semibold mb-2">Bio</h2>
                    <p className="text-neutral-300 whitespace-pre-wrap">{user.bio}</p>
                </section>
            )}
        </div>
    );
}


