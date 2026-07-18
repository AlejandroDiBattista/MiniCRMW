import { CrmDashboard } from "@/components/crm/crm-dashboard"
import { getClients } from "@/lib/db"

export const dynamic = "force-dynamic"

export default function Home() {
  return <CrmDashboard initialClients={getClients()} />
}
