// NOTE: Auto-fixed by fix-next15-types.sh
import { type PageProps } from 'next';

// Re-export any metadata/dynamic flags you previously had manually if needed.
// export const dynamic = "force-dynamic";

type LearnPageProps = PageProps<{ params: { lectureId: string } }>;

export default async function Page({ params }: LearnPageProps) {
  // Params can be Promise-like in Next 15 typings. Await to satisfy the type.
  const { lectureId } = await params;

  // TODO: Reinsert your original page logic below (data fetching, components, etc.)
  return <div>Lecture {lectureId}</div>;
}

// If you statically generate pages, keep this function typed properly.
// export async function generateStaticParams(): Promise<Array<{ lectureId: string }>> {
//   return [];
// }
