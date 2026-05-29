"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2Icon, LogInIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function LoginPanel() {
  const { resolvedTheme, setTheme } = useTheme();
  const [signingIn, setSigningIn] = useState(false);
  const isDark = resolvedTheme === "dark";

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>S3 Signer</CardTitle>
          <CardDescription>OSS download links with short-lived signatures.</CardDescription>
          <CardAction>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                  />
                }
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
                <span className="sr-only">Toggle theme</span>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Sign in with PocketID to manage your own S3-compatible OSS profiles
            and download links.
          </p>
          <Button
            onClick={() => {
              setSigningIn(true);
              void signIn("pocketid");
            }}
            disabled={signingIn}
            className="w-full"
          >
            {signingIn ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <LogInIcon data-icon="inline-start" />
            )}
            Sign in
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
