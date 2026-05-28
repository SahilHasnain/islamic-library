# Quick Start Guide: Job Queue System

## What Changed?

✅ **Automatic job queuing** - Upload multiple books without failures
✅ **Sequential processing** - Jobs process one at a time
✅ **No manual intervention** - Queue starts automatically

## For Users

### Uploading Multiple Books

**Before:**
- Upload 5 books → All fail ❌

**Now:**
- Upload 5 books → All process successfully ✅
- Jobs queue automatically
- Process one at a time
- No action needed from you!

### Monitoring Progress

Check the admin console dashboard to see:
- Current job being processed
- Jobs waiting in queue
- Completed jobs

### If a Job Fails

1. Check the error message in the dashboard
2. Click "Requeue" button
3. Queue will automatically process it

## For Developers

### Testing the Queue

```bash
# Start admin console
cd islamic-library/admin-console
npm run dev

# Test queue endpoints
npm run test-queue
```

### API Endpoints

```bash
# Get queue status
curl http://localhost:3000/api/queue/status

# Trigger queue processing (usually auto-triggered)
curl -X POST http://localhost:3000/api/queue/process
```

### How It Works

1. **Job Created** → Status: `queued`
2. **Queue Auto-Starts** → Fetches oldest queued job
3. **Dispatch to Worker** → Status: `processing`
4. **Worker Processes** → Render PDF, validate, publish
5. **Job Complete** → Status: `published`
6. **Next Job** → Repeat until queue empty

### Key Files

- `src/lib/job-queue.ts` - Queue manager
- `src/app/api/queue/process/route.ts` - Trigger endpoint
- `src/app/api/queue/status/route.ts` - Status endpoint

### Configuration

Uses existing environment variables:
```env
WORKER_API_URL=http://localhost:4010
WORKER_API_TOKEN=your-secure-token
```

## Troubleshooting

### Queue Not Processing?

```bash
# Check if worker is running
curl http://localhost:4010/health

# Manually trigger queue
curl -X POST http://localhost:3000/api/queue/process

# Check queue status
curl http://localhost:3000/api/queue/status
```

### Jobs Stuck?

1. Check worker service logs
2. Use "Reset Stuck" in admin console
3. Job will be requeued automatically

## Documentation

- `QUEUE_SYSTEM.md` - Full documentation
- `IMPLEMENTATION_SUMMARY.md` - Technical details
- `scripts/README.md` - Script documentation

## That's It!

The queue system works automatically. Just upload books as normal and they'll process reliably, even in bulk! 🎉
