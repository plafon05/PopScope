import { Outlet, NavLink } from 'react-router';
import { BarChart3, Map, TrendingUp, PieChart } from 'lucide-react';
import { useDemographyData } from '../data/DemographyProvider';

const navItems = [
  { to: '/', label: 'Дашборд', icon: BarChart3, end: true },
  { to: '/forecasts', label: 'Прогнозы', icon: TrendingUp, end: false },
  { to: '/analytics', label: 'Аналитика', icon: PieChart, end: false },
];

export function Layout() {
  const { municipalityCount, regions } = useDemographyData();
  const regionCount = regions.length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <BarChart3 size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-gray-900">Аналитический дашборд</h1>
              <p className="text-xs text-gray-400 mt-0">
                Демографические показатели муниципальных образований России
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
              <Map size={14} />
              <span>
              Данные: 2019–2023 · {municipalityCount} МО · {regionCount} регионов
              </span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Page Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
