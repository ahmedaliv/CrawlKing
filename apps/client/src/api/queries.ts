import {
  FETCH_GROUP_JOBS_QUERY,
  FETCH_JOBS_QUERY
} from '@/constants/queryKeys';
import { fetchGroupJobs, fetchJobs } from '@/utils/api';
import { GroupJob, Job } from '@/utils/types';
import { useQuery } from '@tanstack/react-query';

export const useFetchJobsQuery = () => {
  return useQuery<Job[], Error>({
    queryKey: FETCH_JOBS_QUERY,
    queryFn: fetchJobs
  });
};

export const useFetchGroupJobsQuery = () => {
  return useQuery<GroupJob[], Error>({
    queryKey: FETCH_GROUP_JOBS_QUERY,
    queryFn: fetchGroupJobs
  });
};
