/**
 * @file stores/notificationStore.ts
 * @description SOTA Single Source of Truth for Notifications
 * 
 * This replaces the scattered notification state across:
 * - useBackgroundResponses hook
 * - bgResponseManager service
 * - App.tsx filter logic
 * 
 * Usage:
 *   import { useNotificationStore } from '@/stores/notificationStore';
 *   const { visibleNotifications, add, dismiss } = useNotificationStore();
 */

import { create } from 'zustand';

// Types
export interface BackgroundNotification {
    id: string;
    sessionId: string;
    personaName: string;
    personaAvatar?: string;
    preview: string;
    timestamp: number;
    read: boolean;
}

interface NotificationState {
    // State
    notifications: BackgroundNotification[];
    currentSessionId: string | null;

    // Actions
    add: (notification: Omit<BackgroundNotification, 'read'>) => void;
    dismiss: (id: string) => void;
    markSessionRead: (sessionId: string) => void;
    setCurrentSession: (sessionId: string | null) => void;
    clearAll: () => void;

    // Computed (implemented as function to get latest state)
    getVisibleNotifications: () => BackgroundNotification[];
    getUnreadCount: (sessionId?: string) => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    // Initial state
    notifications: [],
    currentSessionId: null,

    // Add new notification
    add: (notification) => set((state) => ({
        notifications: [
            ...state.notifications,
            { ...notification, read: false }
        ]
    })),

    // Dismiss (remove) a notification
    dismiss: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
    })),

    // Mark all notifications for a session as read and remove them
    markSessionRead: (sessionId) => set((state) => ({
        notifications: state.notifications.filter(n => n.sessionId !== sessionId)
    })),

    // Set current session (used for filtering)
    setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),

    // Clear all notifications
    clearAll: () => set({ notifications: [] }),

    // Get notifications visible to user (excludes current session)
    getVisibleNotifications: () => {
        const { notifications, currentSessionId } = get();
        return currentSessionId
            ? notifications.filter(n => n.sessionId !== currentSessionId && !n.read)
            : notifications.filter(n => !n.read);
    },

    // Get unread count (optionally for a specific session)
    getUnreadCount: (sessionId) => {
        const { notifications } = get();
        if (sessionId) {
            return notifications.filter(n => n.sessionId === sessionId && !n.read).length;
        }
        return notifications.filter(n => !n.read).length;
    }
}));

// Selector hooks for performance (memoized)
export const useVisibleNotifications = () =>
    useNotificationStore((state) => state.getVisibleNotifications());

export const useUnreadCount = (sessionId?: string) =>
    useNotificationStore((state) => state.getUnreadCount(sessionId));
