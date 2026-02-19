/**
 * @file useBackgroundResponses.ts
 * @description Hook to manage background response notifications
 */

import { useState, useEffect, useCallback } from 'react';
import {
    bgResponseManager,
    BackgroundNotification,
    ResponseJob
} from '../../services/backgroundResponseManager';

export interface UseBackgroundResponsesReturn {
    notifications: BackgroundNotification[];
    dismissNotification: (id: string) => void;
    markSessionRead: (sessionId: string) => void;
    getUnreadCount: (sessionId: string) => number;
    getPendingJob: (sessionId: string) => ResponseJob | null;
    hasPendingResponse: (sessionId: string) => boolean;
}

export function useBackgroundResponses(currentSessionId?: string): UseBackgroundResponsesReturn {
    const [allNotifications, setAllNotifications] = useState<BackgroundNotification[]>([]);

    // Filter out notifications for current session (like WhatsApp - no notifications for the chat you're in)
    const notifications = currentSessionId
        ? allNotifications.filter(n => n.sessionId !== currentSessionId)
        : allNotifications;

    // Subscribe to completion events
    useEffect(() => {
        const unsubscribe = bgResponseManager.onComplete((job, notification) => {
            console.log('[useBackgroundResponses] New notification:', notification.personaName);
            setAllNotifications(prev => [...prev, notification]);
        });

        // Load existing notifications
        setAllNotifications(bgResponseManager.getPendingNotifications());

        return unsubscribe;
    }, []);

    const dismissNotification = useCallback((id: string) => {
        setAllNotifications(prev => prev.filter(n => n.id !== id));
        // Find and mark as read in manager
        const notification = notifications.find(n => n.id === id);
        if (notification) {
            bgResponseManager.markNotificationRead(notification.sessionId);
        }
    }, [notifications]);

    const markSessionRead = useCallback((sessionId: string) => {
        setAllNotifications(prev => prev.filter(n => n.sessionId !== sessionId));
        bgResponseManager.markNotificationRead(sessionId);
        bgResponseManager.clearJob(sessionId);
    }, []);

    const getUnreadCount = useCallback((sessionId: string): number => {
        return bgResponseManager.getUnreadCount(sessionId);
    }, []);

    const getPendingJob = useCallback((sessionId: string): ResponseJob | null => {
        return bgResponseManager.getJob(sessionId);
    }, []);

    const hasPendingResponse = useCallback((sessionId: string): boolean => {
        return bgResponseManager.hasPendingResponse(sessionId);
    }, []);

    return {
        notifications,
        dismissNotification,
        markSessionRead,
        getUnreadCount,
        getPendingJob,
        hasPendingResponse,
    };
}
