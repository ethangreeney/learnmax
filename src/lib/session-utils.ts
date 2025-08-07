import type { SessionWithUser } from '@/types/session';

export function isSessionWithUser(session: any): session is SessionWithUser {
  return !!(session?.user && typeof session.user.id === 'string');
}
