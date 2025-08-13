import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type SortKey = 'user' | 'requests' | 'input' | 'output' | 'total' | 'last';

function parseRange(searchParams: URLSearchParams): {
  from: Date | null;
  to: Date | null;
  rangeKey: string;
  bucket: 'day' | 'hour';
} {
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
  return { from, to, rangeKey: range, bucket };
}

function getSort(searchParams: URLSearchParams): { key: SortKey; dir: 'asc' | 'desc' } {
  const key = (searchParams.get('sort') || 'total').toLowerCase();
  const dir = (searchParams.get('order') || 'desc').toLowerCase();
  const isKey: SortKey[] = ['user', 'requests', 'input', 'output', 'total', 'last'];
  const safeKey = (isKey.includes(key as SortKey) ? (key as SortKey) : 'total');
  const safeDir = dir === 'asc' ? 'asc' : 'desc';
  return { key: safeKey, dir: safeDir };
}

function buildOrderBySql(sort: { key: SortKey; dir: 'asc' | 'desc' }): Prisma.Sql {
  const dirSql = sort.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  switch (sort.key) {
    case 'user':
      return Prisma.sql`u."username" ${dirSql} NULLS LAST, u."email" ${dirSql} NULLS LAST, COALESCE(u."name", '') ${dirSql}`;
    case 'requests':
      return Prisma.sql`agg.requests ${dirSql}`;
    case 'input':
      return Prisma.sql`agg."tokensInput" ${dirSql}`;
    case 'output':
      return Prisma.sql`agg."tokensOutput" ${dirSql}`;
    case 'last':
      return Prisma.sql`agg."lastActivity" ${dirSql}`;
    case 'total':
    default:
      return Prisma.sql`agg."totalTokens" ${dirSql}`;
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const sp = url.searchParams;
    const { from, to } = parseRange(sp);
    const { key, dir } = getSort(sp);
    const q = (sp.get('q') || '').trim();
    const model = (sp.get('model') || '').trim();
    const route = (sp.get('route') || '').trim();
    const format = (sp.get('format') || '').trim().toLowerCase();
    const perPage = Math.min(200, Math.max(1, parseInt(sp.get('perPage') || '50', 10) || 50));
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const offset = (page - 1) * perPage;

    const whereParts: Prisma.Sql[] = [];
    if (from) whereParts.push(Prisma.sql`tu."createdAt" >= ${from}`);
    if (to) whereParts.push(Prisma.sql`tu."createdAt" <= ${to}`);
    if (model) whereParts.push(Prisma.sql`tu."model" = ${model}`);
    if (route) whereParts.push(Prisma.sql`tu."route" = ${route}`);
    const whereSql = whereParts.length
      ? Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`
      : Prisma.sql``;

    // Search by username/email only
    const searchSql = q
      ? Prisma.sql`AND (COALESCE(u."username", '') ILIKE ${'%' + q + '%'} OR COALESCE(u."email", '') ILIKE ${'%' + q + '%'})`
      : Prisma.sql``;

    const orderBySql = buildOrderBySql({ key, dir });

    // Summary totals (across all users in range/filters)
    let summary: { requests: bigint; tokensInput: bigint; tokensOutput: bigint; totalTokens: bigint } = {
      requests: 0n,
      tokensInput: 0n,
      tokensOutput: 0n,
      totalTokens: 0n,
    };
    try {
      const rows = (await prisma.$queryRaw(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS requests,
          COALESCE(SUM(tu."tokensInput"), 0)::bigint AS "tokensInput",
          COALESCE(SUM(tu."tokensOutput"), 0)::bigint AS "tokensOutput",
          COALESCE(SUM(tu."totalTokens"), 0)::bigint AS "totalTokens"
        FROM "TokenUsage" tu
        ${whereSql}
      `)) as Array<{
        requests: bigint;
        tokensInput: bigint;
        tokensOutput: bigint;
        totalTokens: bigint;
      }>;
      summary = rows?.[0] || summary;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/relation .*TokenUsage.* does not exist/i.test(msg)) throw e;
    }

    // Count total users matching (for pagination)
    let totalUsers = 0;
    try {
      const rows = (await prisma.$queryRaw(Prisma.sql`
        WITH agg AS (
          SELECT tu."userId"
          FROM "TokenUsage" tu
          ${whereSql}
          GROUP BY tu."userId"
        )
        SELECT COUNT(*)::bigint AS cnt
        FROM agg
        JOIN "User" u ON u."id" = agg."userId"
        ${q ? Prisma.sql`WHERE (COALESCE(u."username", '') ILIKE ${'%' + q + '%'} OR COALESCE(u."email", '') ILIKE ${'%' + q + '%'})` : Prisma.sql``}
      `)) as Array<{ cnt: bigint }>;
      totalUsers = Number(rows?.[0]?.cnt || 0);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/relation .*TokenUsage.* does not exist/i.test(msg)) throw e;
      totalUsers = 0;
    }

    // Main aggregated rows
    const baseSql = Prisma.sql`
      WITH agg AS (
        SELECT
          tu."userId" AS "userId",
          COUNT(*)::bigint AS requests,
          COALESCE(SUM(tu."tokensInput"), 0)::bigint AS "tokensInput",
          COALESCE(SUM(tu."tokensOutput"), 0)::bigint AS "tokensOutput",
          COALESCE(SUM(tu."totalTokens"), 0)::bigint AS "totalTokens",
          MAX(tu."createdAt") AS "lastActivity"
        FROM "TokenUsage" tu
        ${whereSql}
        GROUP BY tu."userId"
      )
      SELECT
        agg."userId" AS "userId",
        u."name" AS name,
        u."username" AS username,
        u."email" AS email,
        u."image" AS image,
        agg.requests AS requests,
        agg."tokensInput" AS "tokensInput",
        agg."tokensOutput" AS "tokensOutput",
        agg."totalTokens" AS "totalTokens",
        agg."lastActivity" AS "lastActivity"
      FROM agg
      JOIN "User" u ON u."id" = agg."userId"
      WHERE 1=1
      ${searchSql}
      ORDER BY ${orderBySql}
    `;

    let rows: any[] = [];
    if (format === 'csv') {
      try {
        rows = (await prisma.$queryRaw(baseSql)) as any[];
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (!/relation .*TokenUsage.* does not exist/i.test(msg)) throw e;
        rows = [];
      }
      const header = [
        'userId',
        'name',
        'username',
        'email',
        'requests',
        'tokensInput',
        'tokensOutput',
        'totalTokens',
        'lastActivity',
      ];
      const csvLines = [header.join(',')].concat(
        rows.map((r) => [
          r.userId,
          (r.name ?? '').toString().replaceAll('"', '""'),
          (r.username ?? '').toString().replaceAll('"', '""'),
          (r.email ?? '').toString().replaceAll('"', '""'),
          String(r.requests),
          String(r.tokensInput),
          String(r.tokensOutput),
          String(r.totalTokens),
          r.lastActivity ? new Date(r.lastActivity).toISOString() : ''
        ].map((v) => /[",\n]/.test(String(v)) ? `"${String(v)}"` : String(v)).join(','))
      );
      const fileName = `tokens_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
      return new NextResponse(csvLines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=${fileName}`,
          'Cache-Control': 'no-store',
        },
      });
    } else {
      try {
        rows = (await prisma.$queryRaw(Prisma.sql`${baseSql} ${Prisma.sql`LIMIT ${perPage} OFFSET ${offset}`}`)) as any[];
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (!/relation .*TokenUsage.* does not exist/i.test(msg)) throw e;
        rows = [];
      }
    }

    return NextResponse.json({
      page,
      perPage,
      totalUsers,
      totalPages: Math.max(1, Math.ceil(totalUsers / perPage)),
      sort: key,
      order: dir,
      filters: {
        q,
        model: model || null,
        route: route || null,
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
      },
      summary: {
        requests: Number(summary?.requests || 0),
        tokensInput: Number(summary?.tokensInput || 0),
        tokensOutput: Number(summary?.tokensOutput || 0),
        totalTokens: Number(summary?.totalTokens || 0),
      },
      rows: rows.map((r) => ({
        userId: r.userId as string,
        name: r.name as string | null,
        username: r.username as string | null,
        email: r.email as string | null,
        image: r.image as string | null,
        requests: Number(r.requests || 0),
        tokensInput: Number(r.tokensInput || 0),
        tokensOutput: Number(r.tokensOutput || 0),
        totalTokens: Number(r.totalTokens || 0),
        lastActivity: r.lastActivity ? new Date(r.lastActivity).toISOString() : null,
      })),
    });
  } catch (err: any) {
    const status = (err && typeof err.status === 'number' && err.status) || 500;
    return NextResponse.json({ error: err?.message || 'Server error' }, { status });
  }
}


