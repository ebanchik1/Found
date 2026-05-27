import { sendEmail } from "../../src/lib/email.js";
export default function LoginPage() {
  return <form onSubmit={() => sendEmail("reset")}>Login</form>;
}
