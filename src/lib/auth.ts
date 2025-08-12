// src/lib/auth.ts
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import prisma from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!, // or GOOGLE_CLIENT_ID
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!, // or GOOGLE_CLIENT_SECRET
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: 'jwt' }, // keep JWT sessions; adapter still persists User/Account
  secret: process.env.NEXTAUTH_SECRET, // REQUIRED in production
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = (token.sub ||
          token.id ||
          '') as string;
        // Prefer the stored profile image from our database over the provider image
        try {
          const userId = (token.sub || token.id) as string | undefined;
          if (userId) {
            const dbUser = await prisma.user.findUnique({
              where: { id: userId },
              select: { image: true },
            });
            if (dbUser?.image) {
              (session.user as { image?: string | null }).image = dbUser.image;
            }
          }
        } catch {
          // Silently ignore; fall back to whatever image NextAuth provided
        }
      }
      return session;
    },
  },
  // pages: { signIn: '/api/auth/signin' }, // optional; default built-in page is fine
};

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    const err = new Error('Unauthorized') as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return session;
}
