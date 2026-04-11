import { notFound } from "next/navigation";
import DeskSectionClient from "../desk-section-client";
import { getDeskSectionBySlug } from "@/lib/desk-config";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function DeskSectionPage({ params }: PageProps) {
  const { slug } = await params;
  const section = getDeskSectionBySlug(slug);
  if (!section) {
    notFound();
  }

  return (
    <div>
      <h2 className="font-headline mb-6 text-xl font-bold text-stone-900">{section.title}</h2>
      <DeskSectionClient slug={slug} />
    </div>
  );
}
