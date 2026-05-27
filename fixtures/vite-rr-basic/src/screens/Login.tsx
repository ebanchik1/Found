import { Button } from "../components/Button.js";
import { auth } from "../lib/auth.js";
export function Login() { return <Button onClick={() => auth.signIn()}>Sign in</Button>; }
