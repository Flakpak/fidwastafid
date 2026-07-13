import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader.js";
import { AdminPipeline } from "./AdminPipeline.js";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        <h1 className="text-xl font-black">Pipeline</h1>
        <AdminPipeline />
      </main>
    </div>
  );
}
