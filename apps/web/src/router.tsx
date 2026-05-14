import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Layout } from './components/layout/Layout';

const DashboardPage        = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const InterviewsPage       = lazy(() => import('./pages/InterviewsPage').then(m => ({ default: m.InterviewsPage })));
const CandidatesPage       = lazy(() => import('./pages/CandidatesPage').then(m => ({ default: m.CandidatesPage })));
const CandidateDetailPage  = lazy(() => import('./pages/CandidateDetailPage').then(m => ({ default: m.CandidateDetailPage })));
const ClientsPage = lazy(() => import('./pages/ClientsPage').then(m => ({ default: m.ClientsPage })));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })));
const PreparationDocPage = lazy(() => import('./pages/PreparationDocPage').then(m => ({ default: m.PreparationDocPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </Layout>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
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

const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clients',
  component: ClientsPage,
});

const clientDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clients/$name',
  component: ClientDetailPage,
});
  
const preparationDocRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/preparation/$id',
  component: PreparationDocPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute,
  interviewsRoute,
  candidatesRoute,
  candidateDetailRoute,
  clientsRoute,
  clientDetailRoute,
  preparationDocRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
