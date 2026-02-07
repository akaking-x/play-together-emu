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
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, activeLetter]);

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

    return result;
  }, [games, activeLetter, search]);

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
