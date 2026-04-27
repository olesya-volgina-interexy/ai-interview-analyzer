import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Layout } from './components/layout/Layout';

const DashboardPage        = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const InterviewsPage       = lazy(() => import('./pages/InterviewsPage').then(m => ({ default: m.InterviewsPage })));
const CandidatesPage       = lazy(() => import('./pages/CandidatesPage').then(m => ({ default: m.CandidatesPage })));
const CandidateDetailPage  = lazy(() => import('./pages/CandidateDetailPage').then(m => ({ default: m.CandidateDetailPage })));

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </Layout>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const interviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/interviews',
  component: InterviewsPage,
});

const candidatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/candidates',
  component: CandidatesPage,
});

const candidateDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/candidates/$name',
  component: CandidateDetailPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  interviewsRoute,
  candidatesRoute,
  candidateDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
