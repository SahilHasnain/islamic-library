"use client";

import { FormEvent, useState } from "react";

const categories = ["Seerah", "Durood", "Dua", "Akhlaq", "Motivation", "Other"];

type SubmissionState = {
  error?: string;
  message?: string;
  jobId?: string;
  slug?: string;
};

export type JobListItem = {
  job: {
    $id: string;
    jobId: string;
    bookSlug: string;
    languageId: string;
    volumeId: string;
    status: string;
    attempt: number;
    createdAt: string;
    updatedAt: string;
    errorMessage?: string;
  };
  book?: {
    title: string;
    category?: string;
    createdBy: string;
  };
};

export function AdminConsole({ initialJobs }: { initialJobs: JobListItem[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<SubmissionState>({});
  const [jobs, setJobs] = useState<JobListItem[]>(initialJobs);
  const [jobsError, setJobsError] = useState<string>();
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [dispatchingJobId, setDispatchingJobId] = useState<string>();

  async function fetchJobs() {
    try {
      const response = await fetch("/api/jobs");
      const payload = (await response.json()) as { jobs?: JobListItem[]; error?: string };

      if (!response.ok) {
        setJobsError(payload.error || "Could not load jobs.");
        return;
      }

      setJobs(payload.jobs || []);
    } catch {
      setJobsError("Could not load jobs.");
    } finally {
      setIsLoadingJobs(false);
    }
  }

  async function loadJobs() {
    setJobsError(undefined);
    setIsLoadingJobs(true);
    await fetchJobs();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setState({});

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);

      const response = await fetch("/api/ingestion/create", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as SubmissionState;

      if (!response.ok) {
        setState({ error: payload.error || "Upload failed." });
        return;
      }

      setState({
        message: payload.message || "Ingestion job queued.",
        jobId: payload.jobId,
        slug: payload.slug,
      });
      form.reset();
      await loadJobs();
    } catch {
      setState({ error: "Network error while creating the ingestion job." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDispatch(jobId: string) {
    setDispatchingJobId(jobId);
    setJobsError(undefined);

    try {
      const response = await fetch(`/api/ingestion/dispatch/${jobId}`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setJobsError(payload.error || "Dispatch failed.");
        return;
      }

      await loadJobs();
    } catch {
      setJobsError("Dispatch failed.");
    } finally {
      setDispatchingJobId(undefined);
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-10 text-stone-50">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.28em] text-amber-300">
            Islamic Library Admin
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-50">
            Upload a source PDF and queue ingestion
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
            This admin console uploads the original PDF to Appwrite, creates the canonical
            book record, and queues an ingestion job for the worker pipeline.
          </p>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-stone-800 bg-stone-900/80 p-6 shadow-2xl shadow-black/20">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Title</span>
                  <input required name="title" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="Light of the Prophet" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Slug</span>
                  <input name="slug" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="Optional. Auto-generated if empty" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Subtitle</span>
                  <input name="subtitle" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="A gentle seerah reading journey" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Author</span>
                  <input name="author" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" placeholder="Editorial Edition" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Category</span>
                  <select name="category" defaultValue="Seerah" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300">
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Created By</span>
                  <input name="createdBy" defaultValue="admin-console" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Language ID</span>
                  <input required name="languageId" defaultValue="english" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-stone-200">Volume ID</span>
                  <input required name="volumeId" defaultValue="volume1" className="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm outline-none transition focus:border-amber-300" />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-stone-200">Description</span>
                <textarea name="description" rows={5} className="w-full rounded-3xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 outline-none transition focus:border-amber-300" placeholder="Short public-facing description for the book card and metadata." />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-stone-200">Source PDF</span>
                <input required type="file" name="pdf" accept="application/pdf" className="block w-full rounded-2xl border border-dashed border-stone-700 bg-stone-950 px-4 py-4 text-sm text-stone-300 file:mr-4 file:rounded-full file:border-0 file:bg-amber-300 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-950" />
              </label>

              <button type="submit" disabled={isSubmitting} className="rounded-full bg-amber-300 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Queueing ingestion..." : "Upload and queue job"}
              </button>
            </form>
          </section>

          <aside className="space-y-5 rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Pipeline</p>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-stone-300">
                <li>1. Source PDF goes to Appwrite `source_pdfs`.</li>
                <li>2. Book document is created with `queued` status.</li>
                <li>3. Ingestion job is created for the VPS worker.</li>
                <li>4. Worker will later convert, validate, and publish assets.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Submission</p>
              {state.error ? (
                <p className="mt-3 text-sm leading-6 text-rose-300">{state.error}</p>
              ) : state.message ? (
                <div className="mt-3 space-y-2 text-sm leading-6 text-emerald-300">
                  <p>{state.message}</p>
                  <p>Job ID: {state.jobId}</p>
                  <p>Book slug: {state.slug}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-stone-400">
                  No upload yet. Successful submissions will show the queued job details here.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4 text-sm leading-6 text-stone-400">
              Keep `APPWRITE_API_KEY` only in server-side env files for this Next app. The browser should never see it.
            </div>
          </aside>
        </div>

        <section className="mt-8 rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Queued Jobs</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-50">Worker handoff control</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                This view is the first execution contract between Appwrite and the VPS worker. You can inspect recently created jobs and trigger dispatch.
              </p>
            </div>
            <button type="button" onClick={() => void loadJobs()} className="rounded-full border border-stone-700 px-4 py-2 text-sm text-stone-200 transition hover:border-amber-300 hover:text-amber-200">
              Refresh jobs
            </button>
          </div>

          {jobsError ? (
            <div className="mt-5 rounded-2xl border border-rose-900/60 bg-rose-950/40 p-4 text-sm text-rose-200">
              {jobsError}
            </div>
          ) : null}

          {isLoadingJobs ? (
            <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5 text-sm text-stone-400">
              Loading recent jobs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950/60 p-5 text-sm text-stone-400">
              No jobs yet. Upload the first source PDF to create one.
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-stone-800">
              <div className="grid grid-cols-[1.7fr_0.8fr_0.8fr_0.8fr_0.9fr] bg-stone-950/80 px-4 py-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                <span>Book</span>
                <span>Status</span>
                <span>Language</span>
                <span>Attempt</span>
                <span>Action</span>
              </div>
              {jobs.map(({ job, book }) => (
                <div key={job.$id} className="grid grid-cols-[1.7fr_0.8fr_0.8fr_0.8fr_0.9fr] items-center gap-3 border-t border-stone-800 px-4 py-4 text-sm">
                  <div>
                    <p className="font-medium text-stone-50">{book?.title || job.bookSlug}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      {job.jobId} • {job.volumeId}
                    </p>
                    {job.errorMessage ? <p className="mt-2 text-xs text-rose-300">{job.errorMessage}</p> : null}
                  </div>
                  <span className="text-stone-300">{job.status}</span>
                  <span className="text-stone-300">{job.languageId}</span>
                  <span className="text-stone-300">{job.attempt}</span>
                  <div>
                    <button
                      type="button"
                      disabled={dispatchingJobId === job.jobId || job.status !== "queued"}
                      onClick={() => void handleDispatch(job.jobId)}
                      className="rounded-full bg-amber-300 px-4 py-2 text-xs font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-300"
                    >
                      {dispatchingJobId === job.jobId ? "Dispatching..." : "Dispatch"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
