# Job Queue System

## Overview

The admin console now includes an automatic job queue system that processes book ingestion jobs sequentially. This prevents failures when multiple books are uploaded at once.

## Problem Solved

**Before:** When dispatching 5 books simultaneously, all jobs would try to process at the same time, causing:
- Resource contention on the worker service
- Race conditions in file system operations
- All jobs failing due to concurrent execution

**After:** Jobs are automatically queued and processed one at a time, ensuring:
- Sequential processing prevents resource conflicts
- Each job gets full worker resources
- Reliable processing even with bulk uploads

## How It Works

### Automatic Queue Processing

1. **Job Creation**: When you upload a book, it's created with status `queued`
2. **Auto-Trigger**: The queue processor automatically starts (if not already running)
3. **Sequential Processing**: Jobs are processed one at a time in creation order
4. **Continuous**: The processor continues until all queued jobs are complete

### Queue States

- **queued**: Job is waiting to be processed
- **processing**: Job is currently being worked on by the worker
- **validating**: Worker is validating the rendered output
- **publishing**: Worker is publishing to the assets repository
- **published**: Job completed successfully
- **failed**: Job failed (can be requeued)
- **retrying**: Job failed but will be retried automatically

## API Endpoints

### Trigger Queue Processing

```bash
POST /api/queue/process
```

Manually trigger the queue processor (usually not needed as it auto-starts).

**Response:**
```json
{
  "success": true,
  "triggered": true,
  "status": {
    "isProcessing": true,
    "currentJobId": "job_1234567890",
    "queuedCount": 3,
    "processingStartedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Queue processing started"
}
```

### Get Queue Status

```bash
GET /api/queue/status
```

Check the current queue status and statistics.

**Response:**
```json
{
  "success": true,
  "status": {
    "isProcessing": true,
    "currentJobId": "job_1234567890",
    "queuedCount": 3,
    "processingStartedAt": "2024-01-15T10:30:00.000Z"
  },
  "queuedJobs": 3,
  "processingJobs": 1
}
```

## Usage

### Uploading Multiple Books

Simply upload books as normal through the admin console. The queue system handles everything automatically:

1. Upload book 1 → Job created, queue starts processing
2. Upload book 2 → Job queued, will process after book 1
3. Upload book 3 → Job queued, will process after book 2
4. ... and so on

### Monitoring Progress

Check the admin console dashboard to see:
- Current job being processed
- Number of jobs in queue
- Job statuses and progress

### Handling Failures

If a job fails:
1. It's marked as `failed` in the database
2. The queue continues with the next job
3. You can requeue the failed job using the "Requeue" button
4. The queue will automatically process it when it reaches the front

## Configuration

### Environment Variables

The queue system uses the same worker configuration:

```env
WORKER_API_URL=http://localhost:4010
WORKER_API_TOKEN=your-secure-token
```

### Queue Behavior

- **Processing Delay**: 2 seconds between jobs (prevents overwhelming the worker)
- **Retry Attempts**: Failed jobs can be retried up to 3 times (configured in worker)
- **Concurrent Limit**: 1 job at a time (sequential processing)

## Technical Details

### Architecture

```
Admin Console (Next.js)
    ↓
Job Queue Manager (job-queue.ts)
    ↓
Worker Service (Node.js HTTP server)
    ↓
PDF Rendering & Publishing
```

### Queue Manager

Located at `src/lib/job-queue.ts`, the queue manager:
- Maintains in-memory queue status
- Fetches queued jobs from Appwrite
- Dispatches jobs to the worker sequentially
- Handles errors and continues processing

### Auto-Start Triggers

The queue automatically starts when:
- A new book is uploaded (`/api/ingestion/create`)
- A job is requeued (`/api/ingestion/recover/[jobId]`)
- Manually triggered (`/api/queue/process`)

### Scaling Considerations

**Current Implementation:**
- In-memory queue status (single instance)
- Suitable for single-server deployments

**For Multi-Instance Deployments:**
- Replace in-memory status with Redis
- Implement distributed locking
- Use a dedicated queue service (Bull, BullMQ, etc.)

## Troubleshooting

### Queue Not Processing

**Check:**
1. Is the worker service running? (`http://localhost:4010/health`)
2. Are environment variables set correctly?
3. Check admin console logs for errors

**Solution:**
```bash
# Manually trigger queue processing
curl -X POST http://localhost:3000/api/queue/process
```

### Jobs Stuck in "Processing"

**Cause:** Worker crashed or network issue

**Solution:**
1. Check worker service logs
2. Use "Reset Stuck" action in admin console
3. Job will be requeued automatically

### All Jobs Failing

**Check:**
1. Worker service logs for errors
2. PDF file validity
3. Disk space on worker server
4. Network connectivity

## Best Practices

1. **Upload in Batches**: Upload 5-10 books at a time, wait for completion
2. **Monitor Progress**: Check the dashboard regularly during bulk uploads
3. **Handle Failures**: Review and requeue failed jobs promptly
4. **Worker Resources**: Ensure worker has adequate CPU, memory, and disk space

## Future Enhancements

Potential improvements:
- [ ] Priority queue (urgent jobs first)
- [ ] Parallel processing (multiple workers)
- [ ] Job scheduling (process at specific times)
- [ ] Email notifications on completion/failure
- [ ] Detailed progress tracking (percentage complete)
- [ ] Job cancellation support
- [ ] Redis-based queue for multi-instance support
