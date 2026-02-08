import { useEffect, useState, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { GameCard } from '../components/GameCard';

const PAGE_SIZE = 8;
const LETTERS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function HomePage() {
  const games = useGameStore((s) => s.games);
  const loading = useGameStore((s) => s.loading);
  const fetchGames = useGameStore((s) => s.fetchGames);

  const [search, setSearch] = useState('');
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, activeLetter, activeTags]);

  // Collect all unique tags from loaded games
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    games.forEach((g) => g.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [games]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const filtered = useMemo(() => {
    let result = games;

    if (activeLetter) {
      result = result.filter((g) => {
        const first = g.title.charAt(0).toUpperCase();
        if (activeLetter === '#') return !/[A-Z]/i.test(first);
        return first === activeLetter;
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((g) => g.title.toLowerCase().includes(q));
    }

    if (activeTags.length > 0) {
      result = result.filter((g) =>
        activeTags.some((tag) => g.tags?.includes(tag))
      );
    }

    return result;
  }, [games, activeLetter, search, activeTags]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="page-header">
        <h1>Chon game</h1>
        <p className="text-muted">Chon mot game de bat dau choi cung ban be</p>
      </div>

      {/* Search bar */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Tim kiem game..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Alphabet filter */}
      <div className="alphabet-filter">
        {LETTERS.map((letter) => (
          <button
            key={letter}
            className={`alphabet-btn${activeLetter === letter ? ' active' : ''}`}
            onClick={() => setActiveLetter(activeLetter === letter ? null : letter)}
          >
            {letter}
          </button>
        ))}
        {activeLetter && (
          <button
            className="alphabet-btn alphabet-btn-clear"
            onClick={() => setActiveLetter(null)}
          >
            Tat ca
          </button>
        )}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="tag-filter" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
          {activeTags.length > 0 && (
            <button
              className="alphabet-btn alphabet-btn-clear"
              onClick={() => setActiveTags([])}
            >
              Tat ca
            </button>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              className={`badge${activeTags.includes(tag) ? ' badge-active' : ''}`}
              style={{
                cursor: 'pointer',
                padding: '4px 10px',
                border: 'none',
                opacity: activeTags.length > 0 && !activeTags.includes(tag) ? 0.5 : 1,
              }}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="loading-spinner">Dang tai...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {games.length === 0 ? (
            <>
              <p>Chua co game nao.</p>
              <p className="text-muted">Lien he admin de them game.</p>
            </>
          ) : (
            <p>Khong tim thay game phu hop.</p>
          )}
        </div>
      ) : (
        <>
          <div className="game-grid">
            {paged.map((game) => (
              <GameCard key={game._id} game={game} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Truoc
              </button>
              <span>Trang {page} / {totalPages}</span>
              <button
                className="btn btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Tiep
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
