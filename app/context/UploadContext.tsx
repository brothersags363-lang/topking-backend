import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { subscribeUploadJobs, UploadJob } from '../services/uploadManager';

type UploadContextValue = {
  uploadJobs: UploadJob[];
  activeUploads: UploadJob[];
};

const UploadContext = createContext<UploadContextValue>({
  uploadJobs: [],
  activeUploads: [],
});

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);

  useEffect(() => subscribeUploadJobs(setUploadJobs), []);

  const value = useMemo(
    () => ({
      uploadJobs,
      activeUploads: uploadJobs.filter(
        (job) => job.status === 'uploading' || job.status === 'processing',
      ),
    }),
    [uploadJobs],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUpload() {
  return useContext(UploadContext);
}
