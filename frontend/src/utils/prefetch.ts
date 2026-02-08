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

export async function isROMCached(gameId: string): Promise<boolean> {
  if (!isCacheAPIAvailable()) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const resp = await cache.match(`/api/games/${gameId}/rom`);
    return !!resp;
  } catch {
    return false;
  }
}

export function prefetchROMWithProgress(
  gameId: string,
  title?: string,
  onProgress?: (pct: number) => void,
): { promise: Promise<boolean>; abort: () => void } {
  const url = `/api/games/${gameId}/rom`;
  const controller = new AbortController();

  const promise = (async (): Promise<boolean> => {
    try {
      if (isCacheAPIAvailable()) {
        const cache = await caches.open(CACHE_NAME);
        const existing = await cache.match(url);
        if (existing) {
          onProgress?.(100);
          return true;
        }
      }

      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return false;

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body || !total) {
        // Can't stream — fall back to full download
        const blob = await response.blob();
        onProgress?.(100);

        if (isCacheAPIAvailable()) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url, new Response(blob, {
            headers: response.headers,
          }));
          const meta = getMeta();
          meta[gameId] = {
            title: title || gameId,
            sizeBytes: blob.size,
            cachedAt: new Date().toISOString(),
          };
          setMeta(meta);
        }
        return true;
      }

      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onProgress?.(Math.min(99, Math.round((received / total) * 100)));
      }

      const blob = new Blob(chunks);
      onProgress?.(100);

      if (isCacheAPIAvailable()) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url, new Response(blob, {
          headers: response.headers,
        }));
        const meta = getMeta();
        meta[gameId] = {
          title: title || gameId,
          sizeBytes: blob.size,
          cachedAt: new Date().toISOString(),
        };
        setMeta(meta);
      }

      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false;
      return false;
    }
  })();

  return { promise, abort: () => controller.abort() };
}
