import { DataTable } from '@/components/DataTable';
import { useToast } from '@/components/hooks/use-toast';
import { TimePickerDemo } from '@/components/time-picker/time-picker-demo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { FETCH_JOBS_QUERY } from '@/constants/queryKeys';
import { cn } from '@/lib/utils';
import { apiPrefix, client } from '@/utils/client';
import { exportJob } from '@/utils/exportUtil';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { CalendarIcon, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

const formSchema = z.object({
  site: z.string().url({ message: 'Invalid URL.' }),
  pincode: z.string().min(1, { message: 'Zip Code is required.' }),
  dateTime: z.date(),
  immediate: z.boolean(),
  scheduled: z.boolean(),
  recurring: z.boolean(),
  repeatInterval: z.string().optional()
});

type FormSchemaType = z.infer<typeof formSchema>;

export function Home() {
  const { toast } = useToast();
  const form = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      site: '',
      pincode: '',
      dateTime: new Date(Date.now() + 60 * 60 * 1000),
      immediate: true,
      scheduled: false,
      recurring: false,
      repeatInterval: 'daily'
    }
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleUnauthorizedError = () => {
    navigate('/login');
    localStorage.removeItem('token');
    localStorage.removeItem('jobId');
  };
  const submitMutation = useMutation({
    mutationFn: async ({
      site,
      pincode,
      dateTime,
      scheduled,
      recurring,
      repeatInterval
    }: FormSchemaType) => {
      const payload: {
        url: string;
        pincode: string;
        schedulingTime?: Date;
        recurring?: boolean;
        repeatInterval?: string;
      } = {
        url: site,
        pincode: pincode
      };
      if (scheduled) {
        payload.schedulingTime = dateTime;
        if (recurring) {
          payload.recurring = true;
          payload.repeatInterval = repeatInterval;
        }
      }
      const res = await client.post('scrape', {
        json: payload,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}` || ''
        },
        method: 'POST'
      });
      return (await res.json()) as { jobId: string; jobType: string };
    },
    onMutate: () => {
      queryClient.invalidateQueries({ queryKey: FETCH_JOBS_QUERY });
    },
    onSuccess: (data, variables) => {
      setHasConnectionError(false);
      localStorage.setItem('jobId', data.jobId);
      localStorage.setItem('jobType', data.jobType);
      setJobType(data.jobType);
      queryClient.invalidateQueries({ queryKey: FETCH_JOBS_QUERY });
      // show toast message and reset form values if (scheduled or recurring)
      if (variables.immediate) {
        toast({
          title: 'Scraping initiated',
          description: 'Scraping has been initiated successfully'
        });
      } else if (variables.scheduled && !variables.recurring) {
        // add the scheduling time to the toast
        toast({
          title: 'Scraping scheduled',
          description: `Scraping has been scheduled for ${format(
            variables.dateTime,
            'PPP HH:mm:ss'
          )}`
        });
      } else {
        // add the scheduling time to the toast
        toast({
          title: 'Scraping scheduled',
          description: `Scraping has been scheduled for ${format(
            variables.dateTime,
            'PPP HH:mm:ss'
          )} and will repeat ${variables.repeatInterval}`
        });
      }
    },
    onError: async (error) => {
      const errorData = error.message;
      if (errorData.includes('Unauthorized')) {
        handleUnauthorizedError();
      }
    }
  });
  const onDownloadClick = () => {
    const jobId = submitMutation?.data?.jobId;
    if (jobId) {
      exportJob(jobId, toast);
    }
  };
  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await client.post('jobs/stop', {
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
  const retryJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`${apiPrefix}/jobs/retry/${jobId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      return (await response.json()) as { message: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FETCH_JOBS_QUERY });
    }
  });

  let jobId = localStorage.getItem('jobId') || null;
  const [jobType, setJobType] = useState(() => localStorage.getItem('jobType'));
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);

  const progressQuery = useQuery({
    retry: (failureCount, error) => {
      // Check if it's a network error
      if (error.message === 'Network error' || error instanceof TypeError) {
        // Stop retrying after 3 failures
        if (failureCount > 2) {
          setHasConnectionError(true); // Set connection error state
          // enable the retry button
          isFailed = true;
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
        jobType === 'immediate' &&
        query &&
        query?.state?.data?.status !== 'completed' &&
        query?.state?.data?.status !== 'cancelled' &&
        query?.state?.data?.status !== 'unknown'
      );
    },
    queryFn: async () => {
      const res = await client.get(`jobs/status/${jobId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}` || ''
        }
      });
      if (!res.ok) {
        if (res.status === 401) {
          handleUnauthorizedError();
        }
      }
      const json = (await res.json()) as {
        status: 'running' | 'completed' | 'cancelled' | 'failed' | 'unknown';
        progress: number;
        totalProducts: number | string;
      };
      if (json.status !== previousStatus) {
        setPreviousStatus(json.status);

        // If status changes to a terminal state, invalidate the `jobs` query
        if (['completed', 'cancelled', 'failed'].includes(json.status)) {
          queryClient.invalidateQueries({ queryKey: FETCH_JOBS_QUERY });
        }
      }

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

  function onSubmit(data: FormSchemaType) {
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    submitMutation.mutate(data);
  }
  const isScheduled = form.watch('scheduled');
  const isRecurring = form.watch('recurring');
  const isImmediate = form.watch('immediate');
  return (
    <div className="flex size-full w-full flex-col">
      <div className="h-10 w-full ">
        <Button
          variant={'ghost'}
          onClick={handleLogout}
          className="absolute right-4 top-0"
          size={'sm'}
        >
          <LogOut size={18} />
        </Button>
      </div>
      <div className="flex size-full flex-col gap-10 px-10 pt-7 sm:px-14 md:flex-row md:justify-between md:gap-20 md:px-12 lg:px-24">
        <div className="flex md:w-2/5 lg:w-1/3">
          <Form {...form}>
            <form
              className="flex w-full flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <div className="">
                <div>
                  <FormField
                    control={form.control}
                    name="site"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Site</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div>
                    <FormField
                      control={form.control}
                      name="pincode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zip Code</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-center">
                    <FormField
                      control={form.control}
                      name="immediate"
                      render={({ field }) => (
                        <FormItem className="py-2">
                          <FormLabel>Immediate</FormLabel>
                          <FormControl>
                            <Checkbox
                              className="mx-3"
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                form.setValue('immediate', checked as boolean);
                                form.setValue(
                                  'scheduled',
                                  !(checked as boolean)
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="scheduled"
                      render={({ field }) => (
                        <FormItem className="py-2">
                          <FormLabel>Scheduled</FormLabel>
                          <FormControl>
                            <Checkbox
                              className="mx-3"
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                form.setValue('scheduled', checked as boolean);
                                form.setValue(
                                  'immediate',
                                  !(checked as boolean)
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {isScheduled && (
                    <div className="flex flex-col gap-2">
                      <FormField
                        control={form.control}
                        name="dateTime"
                        render={({ field }) => (
                          <FormItem className="py-1">
                            <FormLabel className="text-left">
                              DateTime
                            </FormLabel>
                            <Popover>
                              <FormControl>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      'w-[280px] justify-start text-left font-normal',
                                      !field.value && 'text-muted-foreground'
                                    )}
                                  >
                                    <CalendarIcon className="mr-2 size-4" />
                                    {field.value ? (
                                      format(field.value, 'PPP HH:mm:ss')
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                              </FormControl>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                                <div className="border p-3">
                                  <TimePickerDemo
                                    setDate={field.onChange}
                                    date={field.value}
                                  />
                                </div>
                              </PopoverContent>
                            </Popover>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="recurring"
                        render={({ field }) => (
                          <FormItem className="m-auto pb-2">
                            <FormLabel>Recurring</FormLabel>
                            <FormControl>
                              <Checkbox
                                className="m-2"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {isRecurring && (
                        <FormField
                          control={form.control}
                          name="repeatInterval"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Repeat Interval</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue="daily"
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="daily">Daily</SelectItem>
                                  <SelectItem value="weekly">Weekly</SelectItem>
                                  <SelectItem value="monthly">
                                    Monthly
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-row justify-around pt-4">
                  {!jobId || !isImmediate ? (
                    <>
                      <Button type="submit">Scrape</Button>
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
                                    await queryClient.invalidateQueries({
                                      queryKey: FETCH_JOBS_QUERY
                                    });
                                    localStorage.removeItem('jobId');
                                    await queryClient.resetQueries({
                                      queryKey: ['progress']
                                    });
                                    if (isImmediate) {
                                      console.log('stopping job');
                                      await client.post('jobs/stop', {
                                        json: {
                                          jobId: jobId
                                        },
                                        headers: {
                                          Authorization:
                                            `Bearer ${localStorage.getItem(
                                              'token'
                                            )}` || ''
                                        }
                                      });
                                    }
                                    submitMutation.mutate(
                                      form.getValues() as FormSchemaType
                                    );
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
                    type="button"
                    disabled={!isScrapingInProgress}
                    onClick={() => {
                      stopMutation.mutate();
                    }}
                  >
                    Stop
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
        <div className="flex size-full flex-col space-y-4 pb-10 md:h-1/2">
          <div className="flex items-center justify-between gap-5">
            <h2>Results</h2>
            {isFailed ? (
              <Button
                type="button"
                onClick={() => {
                  if (jobId) {
                    retryJobMutation.mutate(jobId);
                  }
                }}
              >
                Retry
              </Button>
            ) : (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className={clsx({
                        'opacity-50 pointer-events-none cursor-not-allowed':
                          isExportDisabled
                      })}
                      onClick={onDownloadClick}
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
          <div className="size-full  px-3 py-6">
            {(isScrapingInProgress || isScrappingDone || isFailed) && (
              <div className="my-auto flex size-full flex-col space-y-5 p-4">
                <span className="space-x-2">
                  {' '}
                  <Label className="font-bold">Status: </Label>{' '}
                  <Badge>
                    {progressQuery?.data?.status.toLocaleUpperCase()}{' '}
                  </Badge>
                </span>
                <div>
                  <Progress
                    value={
                      progressQuery?.data?.status == 'completed'
                        ? 100
                        : progressQuery?.data?.progress ?? 0
                    }
                  />
                </div>
                <span className="space-x-2">
                  <Label className="font-bold">Items Scraped So Far: </Label>{' '}
                  <Badge>{progressQuery?.data?.totalProducts}</Badge>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex size-full flex-col gap-10 px-10 pt-7 sm:px-14 md:flex-row md:justify-between md:gap-20 md:px-12 lg:px-24">
        <div className="flex w-full">
          <DataTable />
        </div>
      </div>
    </div>
  );
}
//url   pincode  status type repeatInterval nextRunTime completedAt failedAt failReason
