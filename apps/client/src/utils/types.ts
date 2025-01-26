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

export interface JobProgressResponse {
  status: JobStatus;
  progress: number;
  totalProducts: number | string;
}
export type Job = {
  jobId: string;
  url: string;
  pincode: string;
  status: JobStatus;
  type: jobType;
  repeatInterval: string;
  nextRunAt: string;
  completedAt: string;
  failedAt: string;
  failReason: string;
  failCount: number;
  progress: number;
  lastRunStatus: string;
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
