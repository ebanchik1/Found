import { db } from "../../src/lib/db.js";
export default function DashboardPage() {
  return <div>{db.userName}</div>;
}
