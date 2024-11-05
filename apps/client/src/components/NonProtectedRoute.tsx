import { client } from '@/utils/client';
import { useLayoutEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { CrawlLoader } from './Loader';

type propsType = {
  children: React.ReactNode;
};

export const NonProtectedRoute = ({ children }: propsType) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const token = localStorage.getItem('token') || '';

  useLayoutEffect(() => {
    const validateToken = async () => {
      try {
        const response = await client.get('validate-token', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}` || ''
          }
        });
        if (response.status === 200) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      validateToken();
    } else {
      setLoading(false);
    }
  }, [token]);

  if (loading) {
    return <CrawlLoader />;
  }
  return isAuthenticated ? (
    <Navigate to="/" state={{ from: location }} />
  ) : (
    <>{children}</>
  );
};
