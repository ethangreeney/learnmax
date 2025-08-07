// src/lib/auth.ts
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
// If you use the Prisma adapter, uncomment these lines:
// import { PrismaAdapter } from '@auth/prisma-adapter';
// import prisma from '@/lib/prisma';

/**
 * NOTE:
 * - Keep your existing providers here. An empty array compiles fine but will fail at runtime.
 * - Example:
 *     import GoogleProvider from 'next-auth/providers/google';
 *     providers: [GoogleProvider({ clientId: process.env.GOOGLE_ID!, clientSecret: process.env.GOOGLE_SECRET! })]
 */
export const authOptions: NextAuthOptions = {
  // adapter: PrismaAdapter(prisma),
  providers: [
    // ⬅️ Add your providers here
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    /**
     * Add the user's id to the JWT on sign-in.
     */
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.sub = user.id; // keep sub aligned; NextAuth commonly uses sub
      }
      return token;
    },

    /**
     * Expose the user id on the session object.
     * Works with our module augmentation (`src/types/next-auth.d.ts`).
     */
    async session({ session, token }) {
      if (session.user) {
        // Write the id onto the session (typed via module augmentation).
        (session.user as { id?: string }).id = (token.sub || token.id || '') as string;
      }
      return session;
    },
  },
  // Optional, if you have a custom sign-in route:
  // pages: { signIn: '/api/auth/signin' },
};

/**
 * Helper used across API routes to enforce auth.
 * Throws an error with `status: 401` if unauthenticated.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    const err = new Error('Unauthorized') as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return session;
}
