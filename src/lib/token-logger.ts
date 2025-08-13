import prisma from '@/lib/prisma';

export type TokenUsageContext = {
  userId?: string | null;
  route: string;
};

export type TokenUsageRecord = {
  userId?: string | null;
  route: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  createdAt?: Date;
};

function canonicalizeModelId(name: string): string {
  try {
    const raw = String(name || '').trim();
    const withoutProvider = raw.replace(/^(?:openai:|google:|gemini:)/i, '');
    let m = withoutProvider;
    // Map deprecated/alias names
    m = m.replace(/gpt-5-mini/gi, 'gpt-5');
    m = m.replace(/flash-lite/gi, 'flash');
    return m;
  } catch {
    return String(name || '').trim();
  }
}

/**
 * Best-effort logging; never throws. If the table does not exist yet, it is ignored.
 */
export async function recordTokenUsage(rec: TokenUsageRecord): Promise<void> {
  try {
    const userId = rec.userId || undefined;
    if (!userId) return; // we only log for known users
    await prisma.tokenUsage.create({
      data: {
        userId: userId as string | undefined, // undefined allowed by Prisma? We'll assert defined below
        route: rec.route,
        model: canonicalizeModelId(rec.model),
        tokensInput: Math.max(0, Math.floor(rec.tokensInput || 0)),
        tokensOutput: Math.max(0, Math.floor(rec.tokensOutput || 0)),
        totalTokens: Math.max(0, Math.floor(rec.totalTokens || 0)),
        createdAt: rec.createdAt || new Date(),
      } as any,
    } as any);
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (
      msg.includes('TokenUsage') ||
      msg.includes('relation') && msg.includes('does not exist')
    ) {
      // Likely migration not applied yet; ignore silently
      return;
    }
    // Swallow all errors to avoid impacting user flow
  }
}


