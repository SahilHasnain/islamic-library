import { AdminConsole } from "@/components/admin-console";
import { listRecentJobs } from "@/lib/ingestion";

export default async function Home() {
  const jobs = await listRecentJobs(12);

  return <AdminConsole initialJobs={jobs} />;
}
