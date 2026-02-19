/**
 * @file backgroundResponseManager.ts
 * @description Manages AI responses that continue in background when switching personas
 * Enables seamless persona switching without losing pending responses
 */

export interface ResponseJob {
    sessionId: string;
    personaId: string;
    personaName: string;
    personaAvatar?: string;
    status: 'pending' | 'streaming' | 'complete' | 'error';
    response: string;
    chunks: string[];
    startTime: number;
    endTime?: number;
    error?: string;
}

export interface BackgroundNotification {
    id: string;
    sessionId: string;
    personaName: string;
    personaAvatar?: string;
    preview: string;
    timestamp: number;
    read: boolean;
}

type CompletionListener = (job: ResponseJob, notification: BackgroundNotification) => void;
type ChunkListener = (sessionId: string, chunk: string, fullResponse: string) => void;

class BackgroundResponseManager {
    private jobs: Map<string, ResponseJob> = new Map();
    private completionListeners: Set<CompletionListener> = new Set();
    private chunkListeners: Map<string, Set<ChunkListener>> = new Map();
    private notificationQueue: BackgroundNotification[] = [];

    /**
     * Start tracking a new response job
     */
    startResponse(
        sessionId: string,
        personaId: string,
        personaName: string,
        personaAvatar?: string
    ): void {
        const job: ResponseJob = {
            sessionId,
            personaId,
            personaName,
            personaAvatar,
            status: 'pending',
            response: '',
            chunks: [],
            startTime: Date.now(),
        };

        this.jobs.set(sessionId, job);
        console.log(`[BackgroundResponseManager] Started job for ${personaName} (session: ${sessionId})`);
    }

    /**
     * Update job status to streaming
     */
    markStreaming(sessionId: string): void {
        const job = this.jobs.get(sessionId);
        if (job) {
            job.status = 'streaming';
        }
    }

    /**
     * Add a chunk to the response
     */
    addChunk(sessionId: string, chunk: string): void {
        const job = this.jobs.get(sessionId);
        if (job) {
            job.response += chunk;
            job.chunks.push(chunk);
            job.status = 'streaming';

            // Notify chunk listeners for this session
            const listeners = this.chunkListeners.get(sessionId);
            if (listeners) {
                listeners.forEach(cb => cb(sessionId, chunk, job.response));
            }
        }
    }

    /**
     * Mark response as complete and trigger notifications
     */
    completeResponse(sessionId: string): void {
        const job = this.jobs.get(sessionId);
        if (job && job.status !== 'complete') {
            job.status = 'complete';
            job.endTime = Date.now();

            // Create notification
            const notification: BackgroundNotification = {
                id: `notif-${Date.now()}-${sessionId}`,
                sessionId,
                personaName: job.personaName,
                personaAvatar: job.personaAvatar,
                preview: this.generatePreview(job.response),
                timestamp: Date.now(),
                read: false,
            };

            this.notificationQueue.push(notification);

            // Notify completion listeners
            this.completionListeners.forEach(cb => cb(job, notification));

            console.log(`[BackgroundResponseManager] Completed job for ${job.personaName}`);
        }
    }

    /**
     * Mark response as error
     */
    errorResponse(sessionId: string, error: string): void {
        const job = this.jobs.get(sessionId);
        if (job) {
            job.status = 'error';
            job.error = error;
            job.endTime = Date.now();
        }
    }

    /**
     * Get job by session ID
     */
    getJob(sessionId: string): ResponseJob | null {
        return this.jobs.get(sessionId) || null;
    }

    /**
     * Check if session has pending/streaming response
     */
    hasPendingResponse(sessionId: string): boolean {
        const job = this.jobs.get(sessionId);
        return job !== undefined && (job.status === 'pending' || job.status === 'streaming');
    }

    /**
     * Check if session has completed response waiting to be read
     */
    hasCompletedResponse(sessionId: string): boolean {
        const notification = this.notificationQueue.find(n => n.sessionId === sessionId && !n.read);
        return notification !== undefined;
    }

    /**
     * Get all pending notifications
     */
    getPendingNotifications(): BackgroundNotification[] {
        return this.notificationQueue.filter(n => !n.read);
    }

    /**
     * Mark notification as read
     */
    markNotificationRead(sessionId: string): void {
        const notification = this.notificationQueue.find(n => n.sessionId === sessionId);
        if (notification) {
            notification.read = true;
        }
        // Remove from queue after reading
        this.notificationQueue = this.notificationQueue.filter(n => n.sessionId !== sessionId);
    }

    /**
     * Clear completed job after it's been consumed
     */
    clearJob(sessionId: string): void {
        this.jobs.delete(sessionId);
        this.chunkListeners.delete(sessionId);
    }

    /**
     * Subscribe to completion events
     */
    onComplete(callback: CompletionListener): () => void {
        this.completionListeners.add(callback);
        return () => this.completionListeners.delete(callback);
    }

    /**
     * Subscribe to chunk events for a specific session
     */
    onChunk(sessionId: string, callback: ChunkListener): () => void {
        if (!this.chunkListeners.has(sessionId)) {
            this.chunkListeners.set(sessionId, new Set());
        }
        this.chunkListeners.get(sessionId)!.add(callback);
        return () => {
            this.chunkListeners.get(sessionId)?.delete(callback);
        };
    }

    /**
     * Generate preview text for notification
     */
    private generatePreview(response: string): string {
        const cleaned = response.replace(/\n/g, ' ').trim();
        if (cleaned.length <= 50) return cleaned;
        return cleaned.substring(0, 47) + '...';
    }

    /**
     * Get unread count for a session
     */
    getUnreadCount(sessionId: string): number {
        return this.notificationQueue.filter(n => n.sessionId === sessionId && !n.read).length;
    }

    /**
     * Get all active jobs (for debugging)
     */
    getAllJobs(): ResponseJob[] {
        return Array.from(this.jobs.values());
    }
}

// Singleton instance
export const bgResponseManager = new BackgroundResponseManager();
