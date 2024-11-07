// src/lib/exportUtils.js
import { ToastActionElement, ToastProps } from '@/components/ui/toast';
import { apiPrefix } from '../utils/client';
type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};
type Toast = Omit<ToasterToast, 'id'>;
type ToastFunction = (props: Toast) => {
  id: string;
  dismiss: () => void;
  update: (props: ToasterToast) => void;
};
/**
 * Downloads a file for a given job ID.
 *
 * @param {string} jobId - The job ID used to download the file.
 * @param {ToastHandle} toast - The toast function to display notifications.
 */
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
