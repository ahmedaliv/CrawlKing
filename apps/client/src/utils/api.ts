import { apiPrefix, client } from './client';
import {
  Job,
  RetryJobResponse,
  StopJobResponse,
  SubmitScrapeJobPayload,
  SubmitScrapeJobResponse,
  ToastFunction
} from './types';
import { JobProgressResponse } from './types';

export const fetchJobs = async (): Promise<Job[]> => {
  try {
    const response = await fetch(`${apiPrefix}/jobs`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.statusText}`);
    }

    return (await response.json()) as Job[];
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return [];
    // throw error;
  }
};

export const fetchJobProgress = async (
  jobId: string
): Promise<JobProgressResponse> => {
  try {
    const res = await client.get(`jobs/status/${jobId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}` || ''
      }
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Unauthorized');
      }
      throw new Error('Network response was not ok');
    }

    const json: JobProgressResponse = await res.json();
    return json || { status: 'failed', progress: 0, totalProducts: '0' };
  } catch (error) {
    console.error('Error fetching job progress:', error);
    // throw error;
    return { status: 'failed', progress: 0, totalProducts: '0' };
  }
};

export const retryJob = async (
  jobId: string
): Promise<RetryJobResponse | undefined> => {
  try {
    const response = await fetch(`${apiPrefix}/jobs/retry/${jobId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      }
    });
    if (!response.ok) {
      throw new Error('Failed to retry job');
    }

    return (await response.json()) as RetryJobResponse;
  } catch (error) {
    console.error('Error retrying job:', error);
    // throw error;
  }
};

export const exportJob = async (jobId: string, toast: ToastFunction) => {
  try {
    if (!jobId) {
      throw new Error('Job ID is required');
    }

    const response = await fetch(`${apiPrefix}/jobs/download/${jobId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    // Retrieve the filename from the Content-Disposition header if available
    const disposition = response.headers.get('Content-Disposition');
    let filename = 'data.json'; // Default filename if none is provided

    if (disposition && disposition.includes('filename=')) {
      filename = disposition.split('filename=')[1].trim().replace(/"/g, '');
    }

    // Convert the response to a Blob
    const blob = await response.blob();
    const fileURL = window.URL.createObjectURL(blob);

    // Create and click a temporary link to trigger download
    const link = document.createElement('a');
    link.href = fileURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(fileURL);
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Something went wrong while downloading the file',
      variant: 'destructive'
    });
    console.error('Error downloading file:', error);
  }
};

export const submitScrapeJob = async (
  payload: SubmitScrapeJobPayload
): Promise<SubmitScrapeJobResponse> => {
  const json: {
    url: string;
    pincode: string;
    schedulingTime?: Date;
    recurring?: boolean;
    repeatInterval?: string;
  } = {
    url: payload.site,
    pincode: payload.pincode
  };
  if (payload.scheduled) {
    json.schedulingTime = payload.dateTime;
    if (payload.recurring) {
      json.recurring = true;
      json.repeatInterval = payload.repeatInterval;
    }
  }
  const res = await client.post('scrape', {
    json: json,
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}` || ''
    },
    method: 'POST'
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Unauthorized'); // Handle unauthorized access
    }
    throw new Error('Network response was not ok');
  }

  return (await res.json()) as SubmitScrapeJobResponse; // Return the response
};

export const stopJob = async (jobId: string): Promise<StopJobResponse> => {
  const response = await client.post('jobs/stop', {
    json: { jobId },
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to stop job');
  }

  return (await response.json()) as StopJobResponse;
};

export const signIn = async ({
  username,
  password
}: {
  username: string;
  password: string;
}) => {
  try {
    const response = await client.post('users/login', {
      json: { username, password },
      method: 'post'
    });
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid username or password');
      }
      throw new Error(`An Unexpected Error Occurred`);
    }
    return (await response.json()) as { token: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.name === 'TypeError') {
      throw new Error('Server is Down');
    }
    if (error.name === 'HTTPError' && error.response.status === 401) {
      throw new Error('Invalid username or password');
    }
    throw new Error('An Unexpected Error Occurred');
  }
};
