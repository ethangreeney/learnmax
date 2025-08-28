// src/lib/auth.ts
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import AppleProvider from 'next-auth/providers/apple';
import { PrismaAdapter } from '@auth/prisma-adapter';
import prisma from '@/lib/prisma';

const providers = [] as NonNullable<NextAuthOptions['providers']>;
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ID;
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET;
if (GOOGLE_ID && GOOGLE_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: GOOGLE_ID,
      clientSecret: GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

// Optional GitHub provider
const GITHUB_ID = process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID;
const GITHUB_SECRET = process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET;
if (GITHUB_ID && GITHUB_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: GITHUB_ID,
      clientSecret: GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

// Optional Apple provider
const APPLE_ID = process.env.APPLE_CLIENT_ID || process.env.APPLE_ID;
const APPLE_SECRET = process.env.APPLE_CLIENT_SECRET || process.env.APPLE_SECRET;
if (APPLE_ID && APPLE_SECRET) {
  providers.push(
    AppleProvider({
      clientId: APPLE_ID,
      clientSecret: APPLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: 'jwt' }, // keep JWT sessions; adapter still persists User/Account
  secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-me',
  debug: process.env.NODE_ENV !== 'production',
  pages: { signIn: '/login' },
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
        const tokenAny = token as any;
        const userId = (tokenAny?.sub as string | undefined) || (tokenAny?.id as string | undefined);
        if (userId) {
          (session.user as { id?: string }).id = userId;
          // Prefer the stored profile image from our database over the provider image
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: userId },
              select: { image: true },
            });
            if (dbUser?.image) {
              (session.user as { image?: string | null }).image = dbUser.image;
            }
          } catch {
            // Silently ignore; fall back to whatever image NextAuth provided
          }
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
