import { prisma } from '../db/prisma';

export function normalizeClientKey(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function getAliasMap(): Promise<Map<string, string>> {
  const rows = await prisma.clientAlias.findMany({
    select: { alias: true, canonicalName: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.alias, row.canonicalName);
  return map;
}

export function resolveCanonical(
  raw: string | null,
  map: Map<string, string>,
): string | null {
  if (!raw) return raw;
  return map.get(normalizeClientKey(raw)) ?? raw;
}

export async function getCanonicalKeys(canonical: string): Promise<string[]> {
  const aliases = await prisma.clientAlias.findMany({
    where: { canonicalName: canonical },
    select: { alias: true },
  });
  const keys = new Set<string>([normalizeClientKey(canonical)]);
  for (const a of aliases) keys.add(a.alias);
  return [...keys];
}

export function clientNameWhere(keys: string[]) {
  return {
    OR: keys.map((k) => ({
      clientName: { equals: k, mode: 'insensitive' as const },
    })),
  };
}

export async function mergeClients(
  canonicalName: string,
  aliasNames: string[],
): Promise<{ canonicalName: string; aliases: string[] }> {
  const canonical = canonicalName.trim();
  if (!canonical) throw new Error('canonicalName is required');

  const canonKey = normalizeClientKey(canonical);
  const keys = [...new Set(aliasNames.map(normalizeClientKey))].filter(
    (k) => k.length > 0 && k !== canonKey,
  );
  if (keys.length === 0) throw new Error('no aliases to merge');

  await prisma.client.upsert({
    where: { name: canonical },
    create: { name: canonical },
    update: {},
  });

  for (const k of keys) {
    await prisma.clientAlias.upsert({
      where: { alias: k },
      create: { alias: k, canonicalName: canonical },
      update: { canonicalName: canonical },
    });
  }

  await prisma.clientAlias.updateMany({
    where: { canonicalName: { in: keys } },
    data: { canonicalName: canonical },
  });

  return { canonicalName: canonical, aliases: await getCanonicalKeys(canonical) };
}

export async function unmergeClients(aliasNames: string[]): Promise<number> {
  const keys = aliasNames.map(normalizeClientKey).filter((k) => k.length > 0);
  if (keys.length === 0) return 0;
  const res = await prisma.clientAlias.deleteMany({
    where: { alias: { in: keys } },
  });
  return res.count;
}
