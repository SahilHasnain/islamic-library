import { AdminConsole } from "@/components/admin-console";
import { getMonitoringSnapshot } from "@/lib/ingestion";

export default async function Home() {
  const snapshot = JSON.parse(JSON.stringify(await getMonitoringSnapshot(12)));

  return <AdminConsole initialSnapshot={snapshot} />;
}
