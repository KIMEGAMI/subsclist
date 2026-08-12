const DEFAULT_PUBLIC_SITE_URL = "https://subsclist.shinji.work";

function configuredSiteUrl() {
  const value = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? DEFAULT_PUBLIC_SITE_URL;
  try {
    return new URL(value);
  } catch {
    return new URL(DEFAULT_PUBLIC_SITE_URL);
  }
}

export const publicSiteUrl = configuredSiteUrl();
