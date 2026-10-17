import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Play, Download, Bookmark, Search } from 'lucide-react';

interface NavbarProps {
  active_downloads_count: number;
}

export const Navbar: React.FC<NavbarProps> = ({ active_downloads_count }) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-just-black/90 backdrop-blur-md border-b border-surface-25">
      <div className="max-w-page mx-auto px-4 md:px-8 h-18 flex items-center justify-between">
        {/* Brand Wordmark */}
        <Link
          to="/"
          className="flex items-center gap-2 group text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full border border-shockingly-green flex items-center justify-center text-shockingly-green">
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </div>
          <span className="text-2xl font-semibold tracking-tighter text-surface-cream group-hover:text-shockingly-green transition-colors">
            GAIAME<span className="text-shockingly-green">.</span>
          </span>
        </Link>

        {/* Ghost Nav Links */}
        <nav className="flex items-center gap-2 md:gap-4">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-2 text-sm md:text-base font-normal rounded-buttons transition-all cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'text-surface-cream border border-surface-cream/50 bg-off-black/40'
                  : 'text-surface-50 hover:text-surface-cream'
              }`
            }
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Catálogo</span>
          </NavLink>

          <NavLink
            to="/library"
            className={({ isActive }) =>
              `px-3 py-2 text-sm md:text-base font-normal rounded-buttons transition-all cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'text-surface-cream border border-surface-cream/50 bg-off-black/40'
                  : 'text-surface-50 hover:text-surface-cream'
              }`
            }
          >
            <Bookmark className="w-4 h-4" />
            <span>Biblioteca</span>
          </NavLink>

          <NavLink
            to="/downloads"
            className={({ isActive }) =>
              `relative px-3 py-2 text-sm md:text-base font-normal rounded-buttons transition-all cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'text-surface-cream border border-surface-cream/50 bg-off-black/40'
                  : 'text-surface-50 hover:text-surface-cream'
              }`
            }
          >
            <Download className="w-4 h-4" />
            <span>Descargas</span>
            {active_downloads_count > 0 && (
              <span className="w-2 h-2 rounded-full bg-shockingly-green animate-pulse" />
            )}
          </NavLink>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
