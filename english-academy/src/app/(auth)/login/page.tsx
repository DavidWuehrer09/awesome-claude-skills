import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default function Login() {
  return <Suspense><AuthForm mode="login" /></Suspense>;
}
