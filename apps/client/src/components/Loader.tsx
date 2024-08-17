import { Loader } from 'lucide-react';

export function CrawlLoader() {
  return (
    <div className="flex size-full items-center  justify-center ">
      <Loader className="animate-spin " size={30} />
    </div>
  );
}
