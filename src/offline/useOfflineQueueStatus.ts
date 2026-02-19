import { useEffect, useState } from 'react';
import {
  getQueuedMessageCount,
  OFFLINE_QUEUE_UPDATED_EVENT,
} from './messageQueue';

const getOnlineState = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
};

export const useOfflineQueueStatus = () => {
  const [isOnline, setIsOnline] = useState<boolean>(getOnlineState());
  const [queuedCount, setQueuedCount] = useState<number>(() => getQueuedMessageCount());

  useEffect(() => {
    const syncQueue = () => {
      setQueuedCount(getQueuedMessageCount());
    };

    const onOnline = () => {
      setIsOnline(true);
      syncQueue();
    };

    const onOffline = () => {
      setIsOnline(false);
      syncQueue();
    };

    const onQueueUpdated = () => syncQueue();
    const onStorage = (event: StorageEvent) => {
      if (event.key?.includes('ashim.offline.message-queue')) {
        syncQueue();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(OFFLINE_QUEUE_UPDATED_EVENT, onQueueUpdated as EventListener);
    window.addEventListener('storage', onStorage);

    syncQueue();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(OFFLINE_QUEUE_UPDATED_EVENT, onQueueUpdated as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return {
    isOnline,
    queuedCount,
  };
};

