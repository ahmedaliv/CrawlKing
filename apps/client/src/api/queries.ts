import { FETCH_JOBS_QUERY } from '@/constants/queryKeys';
import { fetchJobs } from '@/utils/api';
import { Job } from '@/utils/types';
import { useQuery } from '@tanstack/react-query';

export const useFetchJobsQuery = () => {
  return useQuery<Job[], Error>({
    queryKey: FETCH_JOBS_QUERY,
    queryFn: fetchJobs
  });
};
