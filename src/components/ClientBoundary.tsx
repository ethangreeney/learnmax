'use client';

import SignInOut from '@/components/SignInOut';
import { Suspense } from 'react';

export default function ClientBoundary() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignInOut />
    </Suspense>
  );
}
