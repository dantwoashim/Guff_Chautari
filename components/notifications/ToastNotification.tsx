/**
 * @file ToastNotification.tsx
 * @description WhatsApp/Instagram-style toast notifications for completed AI responses
 */

import React, { useEffect, useState } from 'react';
import { X, MessageSquare, ArrowRight } from '../Icons';
import { BackgroundNotification } from '../../services/backgroundResponseManager';

interface ToastNotificationProps {
    notifications: BackgroundNotification[];
    onDismiss: (id: string) => void;
    onNavigate: (sessionId: string) => void;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({
    notifications,
    onDismiss,
    onNavigate,
}) => {
    const [visible, setVisible] = useState<Set<string>>(new Set());
    const [exiting, setExiting] = useState<Set<string>>(new Set());

    // Animate in new notifications
    useEffect(() => {
        notifications.forEach(n => {
            if (!visible.has(n.id)) {
                setTimeout(() => {
                    setVisible(prev => new Set(prev).add(n.id));
                }, 50);
            }
        });
    }, [notifications]);

    // Auto-dismiss after 6 seconds
    useEffect(() => {
        const timers = notifications.map(n => {
            return setTimeout(() => {
                handleDismiss(n.id);
            }, 6000);
        });

        return () => timers.forEach(t => clearTimeout(t));
    }, [notifications]);

    const handleDismiss = (id: string) => {
        setExiting(prev => new Set(prev).add(id));
        setTimeout(() => {
            onDismiss(id);
            setExiting(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }, 300);
    };

    const handleNavigate = (sessionId: string, id: string) => {
        handleDismiss(id);
        onNavigate(sessionId);
    };

    if (notifications.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 pointer-events-none">
            {notifications.slice(0, 3).map((notification) => (
                <div
                    key={notification.id}
                    className={`
            pointer-events-auto
            bg-[#202c33] border border-[#313d45]
            rounded-2xl p-4 shadow-2xl
            min-w-[320px] max-w-[400px]
            transform transition-all duration-300 ease-out
            ${visible.has(notification.id) && !exiting.has(notification.id)
                            ? 'translate-y-0 opacity-100'
                            : '-translate-y-[120%] opacity-0'
                        }
            hover:bg-[#2a3942] cursor-pointer
            group
          `}
                    onClick={() => handleNavigate(notification.sessionId, notification.id)}
                >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                            {notification.personaAvatar ? (
                                <img
                                    src={notification.personaAvatar}
                                    alt={notification.personaName}
                                    className="w-12 h-12 rounded-full object-cover ring-2 ring-[#00a884]"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00a884] to-[#128c7e] flex items-center justify-center">
                                    <span className="text-white font-semibold text-lg">
                                        {notification.personaName.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                            )}
                            {/* Online indicator */}
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#00a884] rounded-full border-2 border-[#202c33] flex items-center justify-center">
                                <MessageSquare size={8} className="text-white" />
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-[#e9edef] font-semibold text-sm">
                                    {notification.personaName} replied
                                </h4>
                                <span className="text-[#8696a0] text-xs">
                                    just now
                                </span>
                            </div>
                            <p className="text-[#8696a0] text-sm truncate">
                                {notification.preview}
                            </p>
                        </div>

                        {/* Close button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDismiss(notification.id);
                            }}
                            aria-label="Dismiss notification"
                            title="Dismiss"
                            className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-[#374248] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X size={14} className="text-[#8696a0]" />
                        </button>
                    </div>

                    {/* View button */}
                    <div className="mt-3 pt-3 border-t border-[#313d45] flex items-center justify-between">
                        <span className="text-[#00a884] text-xs font-medium">
                            Tap to view conversation
                        </span>
                        <ArrowRight size={16} className="text-[#00a884] group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>
            ))}

            {/* Overflow indicator */}
            {notifications.length > 3 && (
                <div className="pointer-events-auto bg-[#202c33] border border-[#313d45] rounded-xl px-4 py-2 text-center">
                    <span className="text-[#8696a0] text-sm">
                        +{notifications.length - 3} more notifications
                    </span>
                </div>
            )}
        </div>
    );
};

export default ToastNotification;
