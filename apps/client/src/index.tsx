import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { Home } from './pages/home';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Login from './pages/login';
import ProtectedRoute from './components/ProtectedRoute';
import { NonProtectedRoute } from './components/NonProtectedRoute';
import { Toaster } from '@/components/ui/toaster';

const container = document.getElementById('root') as HTMLDivElement;
const root = createRoot(container);
const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Home />
      </ProtectedRoute>
    ),
    errorElement: <div>Not Found</div>
  },
  {
    path: '/login',
    element: (
      <NonProtectedRoute>
        <Login />
      </NonProtectedRoute>
    ),
    errorElement: <div>Not Found</div>
  }
]);

root.render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <Toaster />
  </QueryClientProvider>
);
