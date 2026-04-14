import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { InterviewsPage } from './pages/InterviewsPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { CandidateDetailPage } from './pages/CandidateDetailPage';

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
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