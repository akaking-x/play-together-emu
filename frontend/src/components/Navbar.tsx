import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          PS1 Web Multiplayer
        </Link>

        <div className="nav-links">
          <Link to="/" className={isActive('/')}>
            Trang chu
          </Link>
          <Link to="/settings" className={isActive('/settings')}>
            Cai dat
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin" className={isActive('/admin')}>
              Quan tri
            </Link>
          )}
        </div>

        <div className="nav-user">
          <span className="nav-username">
            {user?.displayName || user?.username}
          </span>
          <button onClick={logout} className="btn btn-sm btn-outline">
            Dang xuat
          </button>
        </div>
      </div>
    </nav>
  );
}
