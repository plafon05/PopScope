import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';

const DashboardPage = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const ForecastsPage = lazy(() =>
  import('./pages/Forecasts').then((module) => ({ default: module.Forecasts })),
);
const AnalyticsPage = lazy(() =>
  import('./pages/Analytics').then((module) => ({ default: module.Analytics })),
);

function PageLoader() {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-10 text-sm text-gray-500">
      Загрузка страницы...
    </div>
  );
}

function DashboardRoute() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DashboardPage />
    </Suspense>
  );
}

function ForecastsRoute() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ForecastsPage />
    </Suspense>
  );
}

function AnalyticsRoute() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AnalyticsPage />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: DashboardRoute },
      { path: 'forecasts', Component: ForecastsRoute },
      { path: 'analytics', Component: AnalyticsRoute },
    ],
  },
]);
