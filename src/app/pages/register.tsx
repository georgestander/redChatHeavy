import Link from "@/components/link";
import { SignupForm } from "@/components/signup-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  return (
    <>
      <title>Create an account</title>
      <meta content="Create an account to get started." name="description" />
      <div className="container m-auto flex h-dvh w-screen flex-col items-center justify-center px-4">
        <Link
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "absolute top-4 right-4 md:top-8 md:right-8"
          )}
          href="/login"
        >
          Login
        </Link>
        <div className="mx-auto w-full sm:w-[480px]">
          <SignupForm />
        </div>
      </div>
    </>
  );
}
