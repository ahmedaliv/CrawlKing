import { FETCH_JOBS_QUERY } from '@/constants/queryKeys';
import { retryJob } from '@/utils/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export const useRetryJobMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: retryJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FETCH_JOBS_QUERY });
    }
  });
};
