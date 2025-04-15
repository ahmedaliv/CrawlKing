import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { LogOut as LogOutIcon } from 'lucide-react';

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
    <div className="h-10 w-full ">
      <Button
        variant={'ghost'}
        onClick={handleLogout}
        className="absolute right-4 top-0"
        size={'sm'}
      >
        <LogOutIcon size={18} />
      </Button>
    </div>
  );
}

export function Header() {
  return <LogOutButton />;
}
