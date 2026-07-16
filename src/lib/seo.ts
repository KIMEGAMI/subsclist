import type { Metadata } from "next";
import { siteConfig } from "./site";

type PageMetadataInput = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
};

export function buildPageMetadata({ title, description, path, image = "/hero-subsclist.png", noIndex = false }: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: path ? { canonical: path } : undefined,
    openGraph: {
      title,
      description,
      url: path ? new URL(path, siteConfig.url).toString() : siteConfig.url,
      siteName: siteConfig.name,
      type: "website",
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};