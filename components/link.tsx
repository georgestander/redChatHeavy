"use client";

import type { AnchorHTMLAttributes, Ref } from "react";

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
  ref?: Ref<HTMLAnchorElement>;
};

const Link = ({ href, prefetch: _prefetch, ref, ...props }: LinkProps) => (
  <a href={href} ref={ref} {...props} />
);

export default Link;
