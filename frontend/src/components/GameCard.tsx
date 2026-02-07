import { useNavigate } from 'react-router-dom';
import type { Game } from '../stores/gameStore';

interface Props {
  game: Game;
}

export function GameCard({ game }: Props) {
  const navigate = useNavigate();

  return (
    <div className="game-card" onClick={() => navigate(`/lobby/${game._id}`)}>
      <div className="game-card-cover">
        {game.coverPath ? (
          <img
            src={`/api/games/covers/${game.coverPath.replace('covers/', '')}`}
            alt={game.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div className="game-card-placeholder">
            <span>{game.title.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="game-card-info">
        <h3 className="game-card-title">{game.title}</h3>
        <div className="game-card-meta">
          <span className="badge">{game.region}</span>
          {game.genre && <span className="badge badge-secondary">{game.genre}</span>}
          <span className="badge badge-info">
            {game.minPlayers}-{game.maxPlayers} nguoi choi
          </span>
        </div>
        {game.description && (
          <p className="game-card-desc">{game.description}</p>
        )}
      </div>
    </div>
  );
}
