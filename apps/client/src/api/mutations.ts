import {
  FETCH_GROUP_JOBS_QUERY,
  FETCH_JOBS_QUERY
} from '@/constants/queryKeys';
import {
  deleteAllGroupJobs,
  deleteAllJobs,
  retryJob,
  signIn
} from '@/utils/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

export const useRetryJobMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: retryJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FETCH_JOBS_QUERY });
    }
  });
};
// delete all jobs
export const useDeleteAllJobsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAllJobs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FETCH_JOBS_QUERY });
    }
  });
};

export const useDeleteAllGroupJobsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAllGroupJobs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FETCH_GROUP_JOBS_QUERY });
    }
  });
};

export const useSignInMutation = (
  setErrorMessage: (message: string) => void
) => {
  const navigate = useNavigate();
  const location = useLocation();
  return useMutation({
    mutationFn: signIn,
    onSuccess: (data) => {
      localStorage.setItem('token', data?.token || '');
      const from = location.state?.from || '/';
      navigate(from);
    },
    onError: (error) => {
      // Set the error message state
      setErrorMessage(error.message || 'An error occurred');
    }
  });
};
