import { GroupJobsDataTable } from '@/components/GroupJobsDataTable';
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
import {
  FETCH_GROUP_JOBS_QUERY,
  FETCH_JOBS_QUERY
} from '@/constants/queryKeys';
import { cn } from '@/lib/utils';
import { apiPrefix, client } from '@/utils/client';
import { exportJob } from '@/utils/exportUtil';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  sites: z.array(z.string().url({ message: 'Invalid URL.' })),
  pincode: z.string().min(1, { message: 'Zip Code is required.' }),
  dateTime: z.date(),
  immediate: z.boolean(),
  scheduled: z.boolean(),
  recurring: z.boolean(),
  repeatInterval: z.string().optional()
});

type FormSchemaType = z.infer<typeof formSchema>;

function NewGroupJobForm() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const [jobType, setJobType] = useState(() => localStorage.getItem('jobType'));
  let jobId = localStorage.getItem('jobId') || null;
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
  const handleUnauthorizedError = () => {
    navigate('/login');
    localStorage.removeItem('token');
    localStorage.removeItem('jobId');
  };
  const form = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      sites: [],
      pincode: '',
      dateTime: new Date(Date.now() + 60 * 60 * 1000),
      immediate: true,
      scheduled: false,
      recurring: false,
      repeatInterval: 'daily'
    }
  });
  const [newUrl, setNewUrl] = useState('');

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'sites'
  });

  const handleAddUrl = () => {
    if (newUrl && newUrl.trim()) {
      append(newUrl.trim());
      setNewUrl('');
    }
  };
  const submitMutation = useMutation({
    mutationFn: async ({
      name,
      sites,
      pincode,
      dateTime,
      scheduled,
      recurring,
      repeatInterval
    }: FormSchemaType) => {
      const payload: {
        name: string;
        urls: string[];
        pincode: string;
        schedulingTime?: string;
        recurring?: boolean;
        repeatInterval?: string;
      } = {
        name,
        urls: sites,
        pincode: pincode
      };
      if (scheduled) {
        const year = dateTime.getFullYear();
        const month = String(dateTime.getMonth() + 1).padStart(2, '0'); // Months are 0-based
        const day = String(dateTime.getDate()).padStart(2, '0');
        const hours = String(dateTime.getHours()).padStart(2, '0'); // Local time
        const minutes = String(dateTime.getMinutes()).padStart(2, '0');
        const seconds = String(dateTime.getSeconds()).padStart(2, '0');

        const localDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        payload.schedulingTime = localDateTime;

        if (recurring) {
          payload.recurring = true;
          payload.repeatInterval = repeatInterval;
        }
      }

      const res = await client.post('scrape-group', {
        json: payload,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}` || ''
        },
        method: 'POST'
      });
      return (await res.json()) as { jobId: string; jobType: string };
    },
    onMutate: () => {
      queryClient.invalidateQueries({ queryKey: FETCH_GROUP_JOBS_QUERY });
    },
    onSuccess: (data, variables) => {
      setHasConnectionError(false);
      localStorage.setItem('jobId', data.jobId);
      localStorage.setItem('jobType', data.jobType);
      setJobType(data.jobType);
      queryClient.invalidateQueries({ queryKey: FETCH_GROUP_JOBS_QUERY });
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
        status:
          | 'running-scraping'
          | 'running-matching'
          | 'completed'
          | 'cancelled'
          | 'failed'
          | 'unknown';
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

  const isScrapingInProgress =
    progressQuery?.data?.status === 'running-scraping' ||
    progressQuery?.data?.status === 'running-matching';
  const isScrappingDone = progressQuery?.data?.status === 'completed';
  let isFailed = progressQuery?.data?.status === 'failed';
  const isExportDisabled = !isScrappingDone;
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
    queryClient.invalidateQueries({ queryKey: [FETCH_GROUP_JOBS_QUERY] });
    submitMutation.mutate(data);
  }
  const isScheduled = form.watch('scheduled');
  const isRecurring = form.watch('recurring');
  const isImmediate = form.watch('immediate');

  return (
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
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sites"
                  render={({ field }) => (
                    <FormItem className="space-y-4">
                      <FormLabel>Sites</FormLabel>
                      <div className="space-y-4">
                        {/* URL input and Add button */}
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder="Enter URL"
                              value={newUrl || ''}
                              onChange={(e) => setNewUrl(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newUrl) {
                                  e.preventDefault();
                                  handleAddUrl();
                                }
                              }}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleAddUrl}
                          >
                            Add
                          </Button>
                        </div>

                        {/* List of URLs */}
                        {field.value && field.value.length > 0 ? (
                          <div className="space-y-2">
                            {field.value.map((url, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2 bg-muted/50 p-2 rounded-md"
                              >
                                <span className="text-sm flex-1 break-all">
                                  {url}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => remove(index)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No sites added yet
                          </p>
                        )}
                      </div>
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
                              form.setValue('scheduled', !(checked as boolean));
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
                              form.setValue('immediate', !(checked as boolean));
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
                          <FormLabel className="text-left">DateTime</FormLabel>
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
                                <SelectItem value="monthly">Monthly</SelectItem>
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
                                Yes I&apos;m sure
                              </Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button>I&apos;ve changed my mind</Button>
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
                      : progressQuery?.data?.status === 'running-matching'
                        ? 50
                        : 0
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export function ScrapeGroup() {
  return (
    <div className="flex size-full w-full flex-col">
      <NewGroupJobForm />

      <div className="flex size-full flex-col gap-10 px-10 pt-7 sm:px-14 md:flex-row md:justify-between md:gap-20 md:px-12 lg:px-24">
        <div className="flex w-full">
          <GroupJobsDataTable />
        </div>
      </div>
    </div>
  );
}
