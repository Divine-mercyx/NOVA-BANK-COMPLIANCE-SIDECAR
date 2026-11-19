/**
 * Nova Bank logo. Defaults to the copy on novabank.ng; set VITE_NOVA_LOGO_URL (for example to a file you
 * put in frontend/public/, such as "/nova-logo.png") to serve it from the portal itself, which also works
 * on a bank network with no internet access. If the image cannot load, the portal shows a NOVA wordmark.
 */
export const NOVA_BANK_LOGO_URL: string =
  (import.meta.env.VITE_NOVA_LOGO_URL as string | undefined) || "https://www.novabank.ng/wp-content/uploads/2025/03/logo-1.png";
