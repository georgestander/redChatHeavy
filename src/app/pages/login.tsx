import { ChevronLeft } from "lucide-react";
import Link from "@/components/link";
import { LoginForm } from "@/components/login-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  return (
    <>
      <title>Login</title>
      <meta content="Login to your account" name="description" />
      <div className="container mx-auto flex h-dvh w-screen flex-col items-center justify-center">
        <Link
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "absolute top-4 left-4 md:top-8 md:left-8"
          )}
          href="/"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Link>
        <div className="mx-auto flex w-full flex-col items-center justify-center sm:w-[420px]">
          <LoginForm className="w-full" />
        </div>
      </div>
    </>
  );
}
