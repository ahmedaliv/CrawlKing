import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export function Layout() {
  return (
    <div className="flex size-full w-full flex-col">
      <Header />
      <Outlet />
    </div>
  );
}
