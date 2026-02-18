"use client";

import Link from "@/components/link";
import { SocialAuthProviders } from "@/components/social-auth-providers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card {...props}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription className="space-y-1">
            <span className="block">Continue with a social provider</span>
            <span className="block text-[11px] text-muted-foreground">
              Powered by RedwoodSDK + Cloudflare
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <SocialAuthProviders />
            <div className="text-center text-sm">
              Already have an account?{" "}
              <a className="underline underline-offset-4" href="/login">
                Sign in
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        By clicking continue, you agree to our{" "}
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}
