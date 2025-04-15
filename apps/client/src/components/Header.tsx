import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, NavLink } from 'react-router-dom';
import { Button } from './ui/button';
import { LogOut as LogOutIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function LogOutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleLogout = () => {
    // Clear token and jobId from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('jobId');

    // Optionally reset query client or state if needed
    queryClient.clear();

    // Redirect to login or home page
    navigate('/login'); // Adjust the path as needed
  };
  return (
    <Button
      variant={'ghost'}
      onClick={handleLogout}
      className="ml-4"
      size={'sm'}
    >
      <LogOutIcon size={18} />
    </Button>
  );
}

export function Header() {
  return (
    <div className="flex items-center justify-between w-full h-14 px-4 border-b">
      <div className="font-bold text-xl">CrawlKing</div>

      <div className="flex items-center">
        <nav className="flex space-x-4 mr-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn(
                'transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <Button
                variant={isActive ? 'default' : 'ghost'}
                className={cn(
                  'transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                Scrape Job
              </Button>
            )}
          </NavLink>
          <NavLink
            to="/group"
            className={({ isActive }) =>
              cn(
                'transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <Button
                variant={isActive ? 'default' : 'ghost'}
                className={cn(
                  'transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                Scrape Group
              </Button>
            )}
          </NavLink>
        </nav>
        <LogOutButton />
      </div>
    </div>
  );
}
