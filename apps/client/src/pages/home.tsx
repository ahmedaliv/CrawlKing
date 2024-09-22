import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import clsx from 'clsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { apiPrefix, client } from '@/lib/client';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckedState } from '@radix-ui/react-checkbox';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
export function Home() {
  const [site, setSite] = useState('');
  const [pincode, setPincode] = useState('');
  const [enableCache, setCacheState] = useState<CheckedState>(false);
  const navigate = useNavigate(); // Add this for navigation
  const queryClient = useQueryClient();
  const handleUnauthorizedError = () => {
    navigate('/login');
    localStorage.removeItem('token');
    localStorage.removeItem('jobId');
  };
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await client.post('scrape', {
        json: {
          url: site,
          pincode: pincode,
          fetchNew: !enableCache
        },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}` || ''
        },
        method: 'POST'
      });
      return (await res.json()) as { jobId: string };
    },

    onSuccess: (data) => {
      setHasConnectionError(false);
      localStorage.setItem('jobId', data.jobId);
    },
    onError: async (error) => {
      const errorData = error.message;
      if (errorData.includes('Unauthorized')) {
        handleUnauthorizedError();
      }
    }
  });
  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await client.post('stop', {
        json: {
          jobId: localStorage.getItem('jobId')
        },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}` || ''
        }
      });
      return (await res.json()) as { jobId: string };
    },
    onSuccess: () => {
      localStorage.removeItem('jobId');
      jobId = null;
    }
  });
  let jobId = localStorage.getItem('jobId') || null;
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const progressQuery = useQuery({
    retry: (failureCount, error) => {
      console.log(failureCount, error);

      // Check if it's a network error
      if (error.message === 'Network error' || error instanceof TypeError) {
        // Stop retrying after 3 failures
        if (failureCount > 2) {
          setHasConnectionError(true); // Set connection error state
          // enable the retry button
          isFailed = true;
          console.log('isFailed', isFailed);
          return false; // Prevent further retries
        }
        return true; // Retry for the first 3 failures
      }
      return failureCount < 3; // Allow retries for other errors
    },
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    enabled: (query) => {
      return (
        !!jobId &&
        !hasConnectionError &&
        query &&
        query?.state?.data?.status !== 'completed' &&
        query?.state?.data?.status !== 'cancelled' &&
        query?.state?.data?.status !== 'unknown'
      );
    },
    queryFn: async () => {
      const res = await client.get(`status/${jobId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}` || ''
        }
      });
      if (!res.ok) {
        console.log(res.body);
        if (res.status === 401) {
          handleUnauthorizedError();
        }
      }
      const json = (await res.json()) as {
        status: 'running' | 'completed' | 'cancelled' | 'failed' | 'unknown';
        progress: number;
        total_products: number;
        duration?: number;
      };
      if ((json as unknown as Record<string, unknown>).error) {
        if (localStorage.getItem('jobId') !== submitMutation.data?.jobId)
          localStorage.removeItem('jobId');
      }
      return json;
    },
    queryKey: ['progress', jobId]
  });
  const isScrapingInProgress = progressQuery?.data?.status === 'running';
  const isScrappingDone = progressQuery?.data?.status === 'completed';
  let isFailed = progressQuery?.data?.status === 'failed';
  const isExportDisabled = !isScrappingDone;
  const handleLogout = () => {
    // Clear token and jobId from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('jobId');

    // Optionally reset query client or state if needed
    queryClient.clear();

    // Redirect to login or home page
    navigate('/login'); // Adjust the path as needed
  };
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea === localStorage) {
        // Redirect to login page if localStorage changes
        navigate('/login');
      }
    };

    const handleBeforeUnload = () => {
      // Remove jobId from localStorage when the tab is closed
      localStorage.removeItem('jobId');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup the event listeners on component unmount
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [navigate]);
  const handleExport = () => {
    fetch(`${apiPrefix}/download/${submitMutation?.data?.jobId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}` || ''
      }
    }).then((response) => {
      response.blob().then((blob) => {
        const fileURL = window.URL.createObjectURL(blob);

        // Setting various property values
        const alink = document.createElement('a');
        alink.href = fileURL;
        alink.download = 'scraped-data.json';
        alink.click();
      });
    });
  };
  return (
    <div className="flex size-full flex-col">
      <div className="h-10 w-full bg-white">
        <Button
          variant={'ghost'}
          onClick={handleLogout}
          className="absolute right-4 top-0"
          size={'sm'}
        >
          <LogOut fill="black" size={18} />
        </Button>
      </div>
      <div className="flex size-full flex-col gap-10 bg-slate-100 px-10 pt-7 sm:px-14 md:flex-row md:justify-between md:gap-20 md:px-24 lg:px-36">
        <div className="flex md:w-2/5 lg:w-1/3">
          <div className="flex w-full flex-col gap-4">
            <div>
              <Label>Site</Label>
              <Input
                value={site}
                onChange={(e) => {
                  setSite(e.target.value);
                }}
              ></Input>
            </div>
            <div>
              <Label>Zip Code</Label>
              <Input
                value={pincode}
                onChange={(e) => {
                  setPincode(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Enable Cache</Label>
              <Checkbox
                checked={enableCache}
                onCheckedChange={(e) => {
                  setCacheState(e);
                }}
              />
            </div>
            {!jobId ? (
              <>
                <Button
                  onClick={() => {
                    submitMutation.mutate();
                  }}
                >
                  Scrape
                </Button>
              </>
            ) : (
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Scrape</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {isScrapingInProgress
                        ? 'Scraping in progress'
                        : 'Starting a new scrape will delete the previous data'}{' '}
                    </DialogTitle>
                  </DialogHeader>
                  <DialogDescription asChild>
                    <div className="flex flex-col gap-2">
                      <div>
                        {isScrapingInProgress
                          ? "Are you sure you want to start a new scraping request, this will stop the current request and you won't be able to retrieve it's data"
                          : 'Starting a new scrape will delete the previous data. Are you sure you want to continue?'}
                      </div>
                      <div className="flex w-full gap-4">
                        <DialogClose asChild>
                          <Button
                            onClick={async () => {
                              localStorage.removeItem('jobId');
                              await queryClient.resetQueries({
                                queryKey: ['progress']
                              });
                              queryClient.clear();
                              await client.post('stop', {
                                json: {
                                  jobId: jobId
                                },
                                headers: {
                                  Authorization:
                                    `Bearer ${localStorage.getItem('token')}` ||
                                    ''
                                }
                              });
                              submitMutation.mutate();
                            }}
                          >
                            Yes I'm sure
                          </Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button>I've changed my mind</Button>
                        </DialogClose>
                      </div>
                    </div>
                  </DialogDescription>
                </DialogContent>
              </Dialog>
            )}
            <Button
              disabled={!isScrapingInProgress}
              onClick={() => {
                stopMutation.mutate();
              }}
            >
              Stop
            </Button>
          </div>
        </div>
        <div className="flex size-full flex-col space-y-4 pb-10 md:h-1/2">
          <div className="flex items-center justify-between gap-5">
            <h2>Results</h2>
            {isFailed ? (
              <Button
                onClick={() => {
                  submitMutation.mutate();
                }}
              >
                Retry
              </Button>
            ) : (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      className={clsx({
                        'opacity-50 pointer-events-none cursor-not-allowed':
                          isExportDisabled
                      })}
                      onClick={handleExport}
                    >
                      Export
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>
                      {isExportDisabled
                        ? 'Export is disabled until scraping is initaited and completed'
                        : 'Download the scraped data'}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="size-full bg-white px-3 py-6">
            {(isScrapingInProgress || isScrappingDone || isFailed) && (
              <div className="my-auto flex size-full flex-col space-y-5 p-4">
                <span className="space-x-2">
                  {' '}
                  <Label className="font-bold">Status: </Label>{' '}
                  <Badge>
                    {progressQuery?.data?.status.toLocaleUpperCase()}{' '}
                  </Badge>
                </span>
                <Progress value={progressQuery?.data?.progress ?? 0} />
                <span className="space-x-2">
                  <Label className="font-bold">Items Scraped So Far: </Label>{' '}
                  <Badge>{progressQuery?.data?.total_products}</Badge>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
