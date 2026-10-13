import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/public/legal-placeholder";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsOfServicePage() {
  return <LegalPlaceholder title="Terms of Service" />;
}
