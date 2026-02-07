import { useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { GameCard } from '../components/GameCard';

export function HomePage() {
  const games = useGameStore((s) => s.games);
  const loading = useGameStore((s) => s.loading);
  const fetchGames = useGameStore((s) => s.fetchGames);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  return (
    <div>
      <div className="page-header">
        <h1>Chon game</h1>
        <p className="text-muted">Chon mot game de bat dau choi cung ban be</p>
      </div>

      {loading ? (
        <div className="loading-spinner">Dang tai...</div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          <p>Chua co game nao.</p>
          <p className="text-muted">Lien he admin de them game.</p>
        </div>
      ) : (
        <div className="game-grid">
          {games.map((game) => (
            <GameCard key={game._id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
