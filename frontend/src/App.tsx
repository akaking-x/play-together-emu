import { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useRoomStore } from './stores/roomStore';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { RoomPage } from './pages/RoomPage';
import { GamePage } from './pages/GamePage';
import { SavesPage } from './pages/SavesPage';
import { SettingsPage } from './pages/SettingsPage';
import { Dashboard } from './pages/admin/Dashboard';
import { UserManager } from './pages/admin/UserManager';
import { GameManager } from './pages/admin/GameManager';

function RoomAutoNavigator() {
  const room = useRoomStore((s) => s.room);
  const gameStarting = useRoomStore((s) => s.gameStarting);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!room || !gameStarting || !room.gameId) return;
    // If we're already on the game page, don't navigate again
    if (location.pathname.startsWith('/game/')) return;
    navigate(`/game/${room.gameId}`);
  }, [room, gameStarting, navigate, location.pathname]);

  return null;
}

function ProtectedRoute() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <RoomAutoNavigator />
      <main style={{ padding: '20px', maxWidth: 1200, margin: '0 auto' }}>
        <Outlet />
      </main>
    </>
  );
}

function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

export function App() {
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/lobby/:gameId" element={<LobbyPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/game/:gameId" element={<GamePage />} />
        <Route path="/saves/:gameId" element={<SavesPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UserManager />} />
          <Route path="games" element={<GameManager />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
