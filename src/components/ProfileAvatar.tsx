'use client';

import Image from 'next/image';
import { useMeStore } from '@/lib/client/me-store';

export default function ProfileAvatar({
  userId,
  src,
  width,
  height,
  className,
  priority = false,
}: {
  userId: string;
  src: string | null | undefined;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}) {
  const me = useMeStore();
  const effectiveSrc = me.id === userId && me.image ? me.image : src || '';
  if (!effectiveSrc) return <div className={className} />;
  const lower = effectiveSrc.toLowerCase();
  const isAnim = lower.includes('.gif') || lower.includes('.webp');
  if (isAnim) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={effectiveSrc} alt="avatar" className={className} referrerPolicy="no-referrer" />;
  }
  return (
    <Image
      src={effectiveSrc}
      alt="avatar"
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}


