import { useNavigate } from 'react-router-dom';

export const useHandleUnauthorizedError = () => {
  const navigate = useNavigate();

  const handleUnauthorizedError = () => {
    // remove jobid,jobtype,token
    localStorage.removeItem('jobId');
    localStorage.removeItem('jobType');
    localStorage.removeItem('token');
    navigate('/login'); // Redirect to login page
  };

  return handleUnauthorizedError;
};
