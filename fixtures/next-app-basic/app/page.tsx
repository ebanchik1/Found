import { db } from "../src/lib/db.js";
export default function HomePage() {
  return <div>Home {db.name}</div>;
}
