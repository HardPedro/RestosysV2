import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ChefHat, LayoutDashboard, Package, DollarSign, UtensilsCrossed, Wine, Calculator, LogOut, Menu, Users, Settings as SettingsIcon, X } from 'lucide-react';
import { cn } from '../lib/utils';
import PrintJobListener from './PrintJobListener';

export default function Layout() {
  const { userData, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'manager'] },
    { name: 'Estoque', path: '/inventory', icon: Package, roles: ['admin', 'manager'] },
    { name: 'Financeiro', path: '/finance', icon: DollarSign, roles: ['admin', 'manager', 'cashier'] },
    { name: 'Garçons', path: '/waiters', icon: Users, roles: ['admin', 'manager'] },
    { name: 'Atendimento', path: '/waiter', icon: Menu, roles: ['waiter'] },
    { name: 'Cozinha', path: '/kitchen', icon: UtensilsCrossed, roles: ['admin', 'manager', 'kitchen'] },
    { name: 'Bar', path: '/bar', icon: Wine, roles: ['admin', 'manager', 'bar'] },
    { name: 'Caixa', path: '/cashier', icon: Calculator, roles: ['admin', 'manager', 'cashier'] },
    { name: 'Configurações', path: '/settings', icon: SettingsIcon, roles: ['admin', 'manager'] },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(userData?.role || ''));

  return (
    <div className="flex h-screen bg-stone-100 flex-col md:flex-row font-sans">
      <PrintJobListener />
      {/* Mobile Header */}
      <header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-4 md:hidden shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white">
            <ChefHat size={20} />
          </div>
          <span className="text-xl font-bold font-heading tracking-tight text-stone-900">RestoSys</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <aside 
            className="absolute left-0 top-0 h-full w-72 bg-stone-950 text-stone-300 shadow-2xl flex flex-col transition-transform"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex h-16 items-center justify-between border-b border-stone-800 px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white shadow-lg shadow-orange-600/20">
                  <ChefHat size={20} />
                </div>
                <span className="text-xl font-bold font-heading tracking-tight text-white">RestoSys</span>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-stone-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
              {filteredNav.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                    location.pathname.startsWith(item.path) 
                      ? "bg-orange-600 text-white shadow-md shadow-orange-600/20" 
                      : "text-stone-400 hover:bg-stone-900 hover:text-stone-100"
                  )}
                >
                  <item.icon size={20} className={cn(location.pathname.startsWith(item.path) ? "text-white" : "text-stone-500")} />
                  {item.name}
                </Link>
              ))}
            </nav>

            <div className="border-t border-stone-800 p-4">
              <button
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
              >
                <LogOut size={20} />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar for Desktop */}
      <aside className="hidden w-72 flex-col bg-stone-950 text-stone-300 md:flex shadow-xl z-20">
        <div className="flex h-20 items-center gap-3 border-b border-stone-800/50 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
            <ChefHat size={24} />
          </div>
          <span className="text-2xl font-bold font-heading tracking-tight text-white">RestoSys</span>
        </div>
        
        <nav className="flex-1 space-y-1.5 p-4 overflow-y-auto">
          {filteredNav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                location.pathname.startsWith(item.path) 
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/20" 
                  : "text-stone-400 hover:bg-stone-900 hover:text-stone-100"
              )}
            >
              <item.icon size={20} className={cn(location.pathname.startsWith(item.path) ? "text-white" : "text-stone-500")} />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="border-t border-stone-800/50 p-4">
          <div className="mb-4 flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-900/50 border border-stone-800/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-800 font-bold text-stone-300 border border-stone-700">
              {userData?.name.charAt(0)}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold text-white truncate">{userData?.name}</span>
              <span className="text-xs text-stone-400 capitalize">{userData?.role}</span>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom Nav for Mobile (Waiters) */}
      {userData?.role === 'waiter' && (
        <nav className="fixed bottom-0 left-0 right-0 flex h-16 items-center justify-around border-t border-stone-200 bg-white md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 pb-safe">
          <Link to="/waiter" className={cn("flex flex-col items-center p-2 transition-colors", location.pathname === '/waiter' ? "text-orange-600" : "text-stone-400 hover:text-stone-600")}>
            <Menu size={24} className={cn(location.pathname === '/waiter' && "drop-shadow-sm")} />
            <span className="text-[10px] font-bold mt-1">Mesas</span>
          </Link>
          <button onClick={logout} className="flex flex-col items-center p-2 text-stone-400 hover:text-red-500 transition-colors">
            <LogOut size={24} />
            <span className="text-[10px] font-bold mt-1">Sair</span>
          </button>
        </nav>
      )}
    </div>
  );
}
