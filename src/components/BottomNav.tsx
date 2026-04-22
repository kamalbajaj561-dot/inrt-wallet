import { useNavigate, useLocation } from 'react-router-dom';

const TABS = [
  { path:'/dashboard',  icon:'⊞',  label:'Home'    },
  { path:'/history',    icon:'⟳',  label:'History' },
  { path:'/rewards',    icon:'✦',  label:'Rewards' },
  { path:'/profile',    icon:'◉',  label:'Profile' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="bottom-nav">
      {TABS.map(t => (
        <button
          key={t.path}
          className={`nav-btn ${pathname === t.path ? 'active' : ''}`}
          onClick={() => navigate(t.path)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
