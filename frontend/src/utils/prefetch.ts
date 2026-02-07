const CACHE_NAME = 'ps1-rom-cache';
const META_KEY = 'ps1-rom-cache-meta';
const prefetching = new Set<string>();

export interface CachedROMEntry {
  gameId: string;
  title: string;
  sizeBytes: number;
  cachedAt: string;
}

type CacheMeta = Record<string, { title: string; sizeBytes: number; cachedAt: string }>;

export function isCacheAPIAvailable(): boolean {
  return typeof caches !== 'undefined';
}

function getMeta(): CacheMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setMeta(meta: CacheMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function extractGameId(url: string): string | null {
  const match = url.match(/\/api\/games\/([^/]+)\/rom/);
  return match?.[1] ?? null;
}

export function prefetchROM(gameId: string, title?: string): void {
  const url = `/api/games/${gameId}/rom`;
  if (prefetching.has(url)) return;
  prefetching.add(url);

  if (!isCacheAPIAvailable()) {
    fetch(url, { priority: 'low' } as RequestInit)
      .catch(() => {})
      .finally(() => prefetching.delete(url));
    return;
  }

  caches.open(CACHE_NAME).then(async (cache) => {
    try {
      const existing = await cache.match(url);
      if (existing) {
        prefetching.delete(url);
        return;
      }

      const response = await fetch(url, { priority: 'low' } as RequestInit);
      if (!response.ok) return;

      const cloned = response.clone();
      await cache.put(url, response);

      const blob = await cloned.blob();
      const meta = getMeta();
      meta[gameId] = {
        title: title || gameId,
        sizeBytes: blob.size,
        cachedAt: new Date().toISOString(),
      };
      setMeta(meta);
    } catch {
      // ignore fetch errors
    } finally {
      prefetching.delete(url);
    }
  });
}

export async function getCachedROMs(): Promise<CachedROMEntry[]> {
  if (!isCacheAPIAvailable()) return [];

  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    const meta = getMeta();
    const entries: CachedROMEntry[] = [];

    for (const req of requests) {
      const gameId = extractGameId(req.url);
      if (!gameId) continue;

      const m = meta[gameId];
      if (m) {
        entries.push({ gameId, title: m.title, sizeBytes: m.sizeBytes, cachedAt: m.cachedAt });
      } else {
        const resp = await cache.match(req);
        const size = resp ? (await resp.blob()).size : 0;
        entries.push({ gameId, title: gameId, sizeBytes: size, cachedAt: '' });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

export async function deleteCachedROM(gameId: string): Promise<boolean> {
  if (!isCacheAPIAvailable()) return false;

  try {
    const cache = await caches.open(CACHE_NAME);
    const url = `/api/games/${gameId}/rom`;
    const deleted = await cache.delete(url);

    const meta = getMeta();
    delete meta[gameId];
    setMeta(meta);

    return deleted;
  } catch {
    return false;
  }
}

export async function clearAllCachedROMs(): Promise<void> {
  if (!isCacheAPIAvailable()) return;

  try {
    await caches.delete(CACHE_NAME);
    localStorage.removeItem(META_KEY);
  } catch {
    // ignore
  }
}
