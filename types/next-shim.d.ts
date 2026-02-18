declare module "next" {
  export type Metadata = any;
  export type NextConfig = any;
  export type Sitemap = any;
  export type Robots = any;
  export type Manifest = any;
}

declare module "next/cache" {
  export function unstable_cache<T extends (...args: any[]) => any>(
    fn: T,
    keyParts?: string[],
    options?: { revalidate?: number | false; tags?: string[] }
  ): T;
  export function revalidateTag(tag: string, mode?: string): void;
}

declare module "next/font/google" {
  export const Geist: any;
  export const Geist_Mono: any;
}

declare module "next/headers" {
  export type RequestCookies = {
    get(name: string): { value: string } | undefined;
    getAll(): Array<{ name: string; value: string }>;
    set: (...args: any[]) => void;
  };
  export function headers(): Promise<Headers> | Headers;
  export function cookies(): Promise<RequestCookies> | RequestCookies;
}

declare module "next/image" {
  import type * as React from "react";
  const Image: React.ForwardRefExoticComponent<
    React.ImgHTMLAttributes<HTMLImageElement> & {
      src?: any;
      alt?: any;
      width?: number | `${number}`;
      height?: number | `${number}`;
      fill?: boolean;
    }
  >;
  export default Image;
}

declare module "next/link" {
  import type * as React from "react";
  const Link: React.ForwardRefExoticComponent<
    React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      href?: any;
      as?: any;
      prefetch?: any;
    }
  >;
  export default Link;
}

declare module "next/navigation" {
  export function notFound(): never;
  export function redirect(url: string): never;
  export function useParams<T extends Record<string, string>>(): T;
  export function usePathname(): string;
  export function useRouter(): {
    push: (...args: any[]) => void;
    replace: (...args: any[]) => void;
    back: () => void;
    refresh: () => void;
    prefetch: (...args: any[]) => void;
  };
  export function useSearchParams(): URLSearchParams;
}

declare module "next/script" {
  import type * as React from "react";
  const Script: React.ComponentType<
    React.ScriptHTMLAttributes<HTMLScriptElement> & {
      strategy?: string;
    }
  >;
  export default Script;
}

declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL;
  }
  export class NextResponse extends Response {
    static json: any;
  }
  export const after: any;
}

declare module "@vercel/analytics/next" {
  import type * as React from "react";
  export const Analytics: React.ComponentType<any>;
}

declare module "@vercel/speed-insights/next" {
  import type * as React from "react";
  export const SpeedInsights: React.ComponentType<any>;
}

// biome-ignore lint/style/useConsistentTypeDefinitions: Interface merging is required to augment fetch init.
interface RequestInit {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}
