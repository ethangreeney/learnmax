import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

function parseRange(searchParams: URLSearchParams): { from: Date | null; to: Date | null; bucket: 'day' | 'hour' } {
  const range = (searchParams.get('range') || '30d').toLowerCase();
  const now = new Date();
  let from: Date | null = null;
  let to: Date | null = null;
  if (searchParams.get('from')) {
    const f = new Date(searchParams.get('from') as string);
    if (!isNaN(f.getTime())) from = f;
  }
  if (searchParams.get('to')) {
    const t = new Date(searchParams.get('to') as string);
    if (!isNaN(t.getTime())) to = t;
  }
  if (!from && !to) {
    switch (range) {
      case '24h':
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        to = now;
        break;
      case '7d':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        to = now;
        break;
      case '30d':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        to = now;
        break;
      case 'all':
        from = null;
        to = null;
        break;
      default:
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        to = now;
        break;
    }
  }
  const spanMs = from && to ? to.getTime() - from.getTime() : 999 * 24 * 60 * 60 * 1000;
  const bucket: 'day' | 'hour' = spanMs <= 2 * 24 * 60 * 60 * 1000 ? 'hour' : 'day';
  return { from, to, bucket };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdmin();
    const { userId } = await ctx.params;
    const url = new URL(req.url);
    const sp = url.searchParams;
    const model = (sp.get('model') || '').trim();
    const route = (sp.get('route') || '').trim();
    const { from, to, bucket } = parseRange(sp);

    const whereParts: Prisma.Sql[] = [Prisma.sql`tu."userId" = ${userId}`];
    if (from) whereParts.push(Prisma.sql`tu."createdAt" >= ${from}`);
    if (to) whereParts.push(Prisma.sql`tu."createdAt" <= ${to}`);
    if (model) whereParts.push(Prisma.sql`tu."model" = ${model}`);
    if (route) whereParts.push(Prisma.sql`tu."route" = ${route}`);
    const whereSql = Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`;

    const bucketSql = bucket === 'hour' ? Prisma.sql`date_trunc('hour', tu."createdAt")` : Prisma.sql`date_trunc('day', tu."createdAt")`;

    const [user] = (await prisma.$queryRaw(Prisma.sql`
      SELECT u."id" AS id, u."name" AS name, u."username" AS username, u."email" AS email, u."image" AS image
      FROM "User" u
      WHERE u."id" = ${userId}
      LIMIT 1
    `)) as Array<{ id: string; name: string | null; username: string | null; email: string | null; image: string | null }>;

    if (!user) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let summaryRows: Array<{ requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint; lastActivity: Date | null }> = [];
    try {
      summaryRows = (await prisma.$queryRaw(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS requests,
        COALESCE(SUM(tu."tokensInput"), 0)::bigint AS "tokensInput",
        COALESCE(SUM(tu."tokensOutput"), 0)::bigint AS "tokensOutput",
        COALESCE(SUM(tu."totalTokens"), 0)::bigint AS "totalTokens",
        MAX(tu."createdAt") AS "lastActivity"
      FROM "TokenUsage" tu
      ${whereSql}
    `)) as Array<{ requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint; lastActivity: Date | null }>;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/relation .*TokenUsage.* does not exist/i.test(msg)) throw e;
      summaryRows = [{ requests: 0n, tokensInput: 0n, tokensOutput: 0n, totalTokens: 0n, lastActivity: null }];
    }
    const summary = summaryRows[0] || { requests: 0n, tokensInput: 0n, tokensOutput: 0n, totalTokens: 0n, lastActivity: null };

    let timeSeries: Array<{ ts: Date; requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint }> = [];
    try {
      timeSeries = (await prisma.$queryRaw(Prisma.sql`
      SELECT
        ${bucketSql} AS ts,
        COUNT(*)::bigint AS requests,
        COALESCE(SUM(tu."tokensInput"), 0)::bigint AS "tokensInput",
        COALESCE(SUM(tu."tokensOutput"), 0)::bigint AS "tokensOutput",
        COALESCE(SUM(tu."totalTokens"), 0)::bigint AS "totalTokens"
      FROM "TokenUsage" tu
      ${whereSql}
      GROUP BY ts
      ORDER BY ts ASC
    `)) as Array<{ ts: Date; requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint }>;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/relation .*TokenUsage.* does not exist/i.test(msg)) throw e;
      timeSeries = [];
    }

    let routeBreakdown: Array<{ route: string; requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint }> = [];
    try {
      routeBreakdown = (await prisma.$queryRaw(Prisma.sql`
      SELECT
        tu."route" AS route,
        COUNT(*)::bigint AS requests,
        COALESCE(SUM(tu."tokensInput"), 0)::bigint AS "tokensInput",
        COALESCE(SUM(tu."tokensOutput"), 0)::bigint AS "tokensOutput",
        COALESCE(SUM(tu."totalTokens"), 0)::bigint AS "totalTokens"
      FROM "TokenUsage" tu
      ${whereSql}
      GROUP BY tu."route"
      ORDER BY "totalTokens" DESC
    `)) as Array<{ route: string; requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint }>;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/relation .*TokenUsage.* does not exist/i.test(msg)) throw e;
      routeBreakdown = [];
    }

    let modelBreakdown: Array<{ model: string; requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint }> = [];
    try {
      // Canonicalize model ids at query time to coalesce aliases
      // - Strip provider prefix (e.g., "openai:")
      // - Map "flash-lite" -> "flash"
      // - Map "gpt-5-mini" -> "gpt-5"
      const canonExpr = Prisma.sql`
        CASE
          WHEN POSITION(':' IN tu."model") > 0 THEN split_part(tu."model", ':', 2)
          ELSE tu."model"
        END
      `;
      const canonMapped = Prisma.sql`
        CASE
          WHEN LOWER(${canonExpr}) LIKE '%gpt-5-mini%' THEN regexp_replace(${canonExpr}, '(?i)gpt-5-mini', 'gpt-5', 'g')
          WHEN LOWER(${canonExpr}) LIKE '%flash-lite%' THEN regexp_replace(${canonExpr}, '(?i)flash-lite', 'flash', 'g')
          ELSE ${canonExpr}
        END
      `;
      modelBreakdown = (await prisma.$queryRaw(Prisma.sql`
        SELECT
          ${canonMapped} AS model,
          COUNT(*)::bigint AS requests,
          COALESCE(SUM(tu."tokensInput"), 0)::bigint AS "tokensInput",
          COALESCE(SUM(tu."tokensOutput"), 0)::bigint AS "tokensOutput",
          COALESCE(SUM(tu."totalTokens"), 0)::bigint AS "totalTokens"
        FROM "TokenUsage" tu
        ${whereSql}
        GROUP BY ${canonMapped}
        ORDER BY "totalTokens" DESC
      `)) as Array<{ model: string; requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint }>;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/relation .*TokenUsage.* does not exist/i.test(msg)) throw e;
      modelBreakdown = [];
    }

    // Canonicalize and coalesce model breakdown in TS as a safety net
    const canonicalize = (name: string): string => {
      const raw = String(name || '').trim();
      const withoutProvider = raw.replace(/^(?:openai:|google:|gemini:)/i, '');
      let m = withoutProvider;
      m = m.replace(/gpt-5-mini/gi, 'gpt-5');
      m = m.replace(/flash-lite/gi, 'flash');
      return m;
    };
    const coalescedModels = (() => {
      const map = new Map<string, { model: string; requests: number; tokensInput: number; tokensOutput: number; totalTokens: number }>();
      for (const r of modelBreakdown) {
        const key = canonicalize(r.model);
        const got = map.get(key) || { model: key, requests: 0, tokensInput: 0, tokensOutput: 0, totalTokens: 0 };
        got.requests += Number(r.requests || 0);
        got.tokensInput += Number(r.tokensInput || 0);
        got.tokensOutput += Number(r.tokensOutput || 0);
        got.totalTokens += Number(r.totalTokens || 0);
        map.set(key, got);
      }
      return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens);
    })();

    return NextResponse.json({
      user,
      filters: {
        userId,
        model: model || null,
        route: route || null,
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
        bucket,
      },
      summary: {
        requests: Number(summary.requests || 0),
        tokensInput: Number(summary.tokensInput || 0),
        tokensOutput: Number(summary.tokensOutput || 0),
        totalTokens: Number(summary.totalTokens || 0),
        lastActivity: summary.lastActivity ? new Date(summary.lastActivity).toISOString() : null,
      },
      timeSeries: timeSeries.map((r) => ({
        ts: new Date(r.ts).toISOString(),
        requests: Number(r.requests || 0),
        tokensInput: Number(r.tokensInput || 0),
        tokensOutput: Number(r.tokensOutput || 0),
        totalTokens: Number(r.totalTokens || 0),
      })),
      routeBreakdown: routeBreakdown.map((r) => ({
        route: r.route,
        requests: Number(r.requests || 0),
        tokensInput: Number(r.tokensInput || 0),
        tokensOutput: Number(r.tokensOutput || 0),
        totalTokens: Number(r.totalTokens || 0),
      })),
      modelBreakdown: coalescedModels,
    });
  } catch (err: any) {
    const status = (err && typeof err.status === 'number' && err.status) || 500;
    return NextResponse.json({ error: err?.message || 'Server error' }, { status });
  }
}


