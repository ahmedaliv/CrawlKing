import { ToastActionElement, ToastProps } from '@/components/ui/toast';

export type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};
export type Toast = Omit<ToasterToast, 'id'>;
export type ToastFunction = (props: Toast) => {
  id: string;
  dismiss: () => void;
  update: (props: ToasterToast) => void;
};

export type jobType = 'immediate' | 'scheduled' | 'recurring';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'failed'
  | 'completed'
  | 'retrying'
  | 'unknown'
  | 'cancelled';
export type GroupJobStatus =
  | 'queued'
  | 'running-matching'
  | 'running-scraping'
  | 'failed'
  | 'completed'
  | 'retrying'
  | 'unknown'
  | 'cancelled';

export interface JobProgressResponse {
  status: JobStatus;
  progress: number;
  totalProducts: number | string;
}

export type JobMetadata = {
  jobId: string;
  // TODO: job status should be in the metadata but the status is different between jobs and group job so we removed it from the metadata
  // status: JobStatus;
  type: jobType;
  repeatInterval: string;
  nextRunAt: string;
  completedAt: string;
  failedAt: string;
  failReason: string;
  failCount: number;
  lastRunStatus: string;
};

export type Job = JobMetadata & {
  url: string;
  pincode: string;
  status: JobStatus;
  progress: number;
};

export type GroupJob = JobMetadata & {
  urls: string[];
  pincode: string;
  status: GroupJobStatus;
  name: string;
};

export interface SubmitScrapeJobPayload {
  site: string;
  pincode: string;
  dateTime?: Date;
  scheduled?: boolean;
  recurring?: boolean;
  repeatInterval?: string;
}

export interface SubmitScrapeJobResponse {
  jobId: string;
  jobType: string;
}

export interface RetryJobResponse {
  message: string;
}
export interface StopJobResponse {
  jobId: string;
}
