import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/public/legal-placeholder";

export const metadata: Metadata = { title: "Disclaimer" };

export default function DisclaimerPage() {
  return <LegalPlaceholder title="Disclaimer" />;
}
