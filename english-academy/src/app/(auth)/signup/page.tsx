import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default function Signup() {
  return <Suspense><AuthForm mode="signup" /></Suspense>;
}
