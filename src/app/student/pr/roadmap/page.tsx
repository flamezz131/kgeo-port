/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- ported as-is from K-GEO-merge2; the recommendation schema is untyped. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStudent } from "@/lib/permissions";
import { RoadmapRetryButton } from "./RoadmapRetryButton";
import { ExportRoadmapButton } from "./ExportRoadmapButton";
import { RoadmapTaskTracker } from "./RoadmapTaskTracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Personalized Roadmap",
};

// The three recommendation buckets, in display order. Class names are spelled
// out in full so Tailwind can see them.
const BUCKETS = [
  {
    key: "achievable",
    title: "Achievable Programs",
    description: "High admission probability based on your academic profile and test scores.",
    empty: "No programs categorized as Achievable in this generation run. Consider broadening your country or course preferences.",
    border: "border-emerald-500",
    countPill: "bg-emerald-100 text-emerald-800",
    scoreBadge: "bg-emerald-100 text-emerald-900 border-emerald-200",
    label: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  {
    key: "target",
    title: "Target Programs",
    description: "Balanced target schools where your profile closely aligns with typical admission standards.",
    empty: "No programs categorized as Target in this generation run.",
    border: "border-[#1D4ED8]",
    countPill: "bg-[#EFF6FF] text-[#1D4ED8]",
    scoreBadge: "bg-blue-100 text-blue-900 border-blue-200",
    label: "bg-blue-50 text-blue-700 border-blue-100",
  },
  {
    key: "ambitious",
    title: "Ambitious Programs",
    description: "Ambitious and dream institutions that require exceptional profiles or targeted application improvements.",
    empty: "No programs categorized as Ambitious in this generation run.",
    border: "border-amber-500",
    countPill: "bg-amber-100 text-amber-800",
    scoreBadge: "bg-amber-100 text-amber-900 border-amber-200",
    label: "bg-amber-50 text-amber-700 border-amber-100",
  },
] as const;

export default async function PersonalizedRoadmapPage() {
  const { supabase, user, profile } = await requireStudent();

  // 1. Check for the student's most recent PR recommendation
  const { data: recs, error: recError } = await (supabase as any)
    .schema("recommendation")
    .from("recommendations")
    .select("id, status, generated_at, profile_snapshot")
    .eq("student_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1);

  if (recError) {
    console.error("Error querying recommendations:", recError);
  }

  // Edge case 1: If no PR recommendation exists yet for this student, redirect to intake
  if (!recs || recs.length === 0) {
    redirect("/student/pr/intake");
  }

  const latestRec = recs[0];

  // If currently generating/queued, redirect to loading loop
  if (latestRec.status === "queued") {
    redirect("/student/pr/generating");
  }

  // Edge case 2: If the most recent one has status 'failed', show friendly retry message
  if (latestRec.status === "failed") {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 md:p-12 text-center text-[#0F172A] shadow-sm space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#0B1F3A]">
            Roadmap Generation Interrupted
          </h1>
          <p className="text-[#64748B] text-base max-w-xl mx-auto leading-relaxed">
            We encountered a temporary timeout or connectivity glitch. Don&apos;t worry — your intake preferences and academic profile are securely saved!
          </p>
          <div className="pt-4">
            <RoadmapRetryButton />
          </div>
          <div className="pt-6 border-t border-red-200/60">
            <Link href="/student/dashboard" className="text-sm font-medium text-[#1D4ED8] hover:underline">
              &larr; Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If completed, query all recommendation items joined with insights and programs
  const { data: items, error: itemsError } = await (supabase as any)
    .schema("recommendation")
    .from("recommendation_items")
    .select(`
      id,
      score,
      rank,
      bucket,
      reason_summary,
      pr_insights (
        fit_score,
        admission_probability,
        why_recommended,
        current_profile,
        target_profile,
        gaps,
        top_actions,
        detailed_roadmap,
        risks,
        application_readiness,
        raw_ai_output
      ),
      university_programs (
        id,
        tuition_estimate_inr,
        universities (
          name,
          country,
          world_rank
        ),
        programs (
          name,
          degree_type
        )
      )
    `)
    .eq("recommendation_id", latestRec.id)
    .order("rank", { ascending: true });

  if (itemsError) {
    console.error("Error fetching recommendation items:", itemsError);
  }

  // Fetch the top-level development plan
  const { data: dpData, error: dpError } = await (supabase as any)
    .schema("recommendation")
    .from("development_plans")
    .select("*")
    .eq("recommendation_id", latestRec.id)
    .maybeSingle();

  if (dpError) {
    console.error("Error fetching development plan:", dpError);
  }
  const developmentPlan = dpData || null;

  // Fetch the interactive roadmap tasks generated alongside the recommendation.
  const { data: tasksData, error: tasksError } = await (supabase as any)
    .schema("recommendation")
    .from("student_roadmap_tasks")
    .select("*")
    .eq("recommendation_id", latestRec.id)
    .order("phase", { ascending: true });

  if (tasksError) {
    console.error("Error fetching roadmap tasks:", tasksError);
  }
  const roadmapTasks = tasksData || [];

  interface GapItem {
    area?: string;
    category?: string;
    type?: string;
    gap_level?: string;
    current?: string;
    target?: string;
  }

  interface DisplayItem {
    id: string;
    rank: number;
    bucket: string;
    university: string;
    country: string;
    worldRank: number | null;
    course: string;
    tagline: string;
    probability: number | null;
    gaps: GapItem[];
    topActions: string[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const displayItems: DisplayItem[] = (items || []).map((item: any): DisplayItem => {
    const insight = Array.isArray(item.pr_insights) ? item.pr_insights[0] : item.pr_insights;
    const aiRaw = insight?.raw_ai_output || {};
    const uniProg = item.university_programs;
    const uni = uniProg?.universities;
    const prog = uniProg?.programs;

    return {
      id: item.id,
      rank: item.rank || 0,
      bucket: item.bucket || aiRaw.category || "Target",
      university: uni?.name || aiRaw.university || aiRaw.university_name || aiRaw.name || aiRaw.institution || "",
      country: uni?.country || aiRaw.country || aiRaw.location || "",
      worldRank: uni?.world_rank || null,
      course: prog?.name || aiRaw.program || aiRaw.course || aiRaw.program_name || aiRaw.degree || "",
      tagline: (insight?.why_recommended?.[0]) || (item.reason_summary?.[0]) || "",
      probability: insight?.fit_score || item.score || null,
      gaps: insight?.gaps || [],
      topActions: insight?.top_actions || [],
    };
  });

  const achievableItems = displayItems.filter((i: DisplayItem) => i.bucket === "Achievable" || i.bucket === "Safe");
  const targetItems = displayItems.filter((i: DisplayItem) => i.bucket === "Target" || i.bucket === "Match");
  const ambitiousItems = displayItems.filter((i: DisplayItem) => i.bucket === "Ambitious" || i.bucket === "Reach");

  const generatedDateStr = new Date(latestRec.generated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const readinessScore = developmentPlan?.readiness_score || 0;

  // Flag a roadmap that predates the student's latest saved profile details.
  const [{ data: profileTimestamps }, { data: preferenceTimestamps }] =
    await Promise.all([
      supabase
        .from("student_profiles")
        .select("updated_at")
        .eq("student_id", user.id)
        .maybeSingle(),
      supabase
        .from("student_preferences")
        .select("updated_at")
        .eq("student_id", user.id)
        .maybeSingle(),
    ]);
  const generatedAt = new Date(latestRec.generated_at).getTime();
  const profileChangedSinceGeneration = [
    profileTimestamps?.updated_at,
    preferenceTimestamps?.updated_at,
  ].some(
    (updatedAt) =>
      typeof updatedAt === "string" &&
      new Date(updatedAt).getTime() > generatedAt,
  );

  return (
    <div id="roadmap-content" className="space-y-12 [overflow-wrap:anywhere] print:space-y-8 print:bg-white print:py-0 print:text-black">
      
      {/* Print-only PDF Cover Page */}
      <div className="hidden print:block pdf-cover pt-20" style={{ pageBreakAfter: 'always' }}>
        <div className="text-center pb-8 border-b-4 border-[#1D4ED8] mb-12">
          <h1 className="text-5xl font-black text-[#0B1F3A] mb-4">Personalized Study-Abroad Report</h1>
          <p className="text-2xl text-[#64748B]">Generated by K-GEO & Gemini AI</p>
        </div>
        <div className="grid grid-cols-2 gap-12 text-sm text-[#0F172A] mb-12 px-12">
          <div>
            <p className="text-[#64748B] font-bold text-sm uppercase mb-2 tracking-wider">Student Name</p>
            <p className="font-black text-3xl">{profile?.full_name || "Student"}</p>
          </div>
          <div>
            <p className="text-[#64748B] font-bold text-sm uppercase mb-2 tracking-wider">College Email</p>
            <p className="font-black text-3xl">{profile?.college_email || user.email}</p>
          </div>
          <div className="col-span-2 pt-8">
            <p className="text-[#64748B] font-bold text-sm uppercase mb-2 tracking-wider">Report Generated</p>
            <p className="font-black text-3xl">{generatedDateStr}</p>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="flex flex-col md:flex-row md:flex-wrap md:items-center justify-between gap-4 pb-6 border-b border-[#DCE6F2] print:hidden">
        <div>
          <h1 className="text-[#0B1F3A] text-3xl font-bold mt-1">
            My Personalized Study-Abroad Roadmap
          </h1>
          <p className="text-[#64748B] text-sm mt-1">
            Generated on {generatedDateStr} &bull; Progress persists across updates.
          </p>
        </div>
        <div className="flex items-center gap-3 no-export">
          <ExportRoadmapButton 
            studentName={profile?.full_name || "Student"} 
            studentEmail={profile?.college_email || user.email || ""} 
            date={generatedDateStr} 
          />
          <Link
            href="/student/pr/intake"
            className="px-4 py-2 rounded-lg border border-[#DCE6F2] bg-white text-[#0F172A] text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Update Profile &amp; Regenerate
          </Link>
        </div>
      </header>

      {profileChangedSinceGeneration && (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden"
          role="status"
        >
          Your profile was updated after this roadmap was generated on{" "}
          {generatedDateStr}. Use <strong>Update Profile &amp; Regenerate</strong>{" "}
          to get recommendations that reflect your current details.
        </p>
      )}

      {/* 0. READINESS OVERVIEW */}
      <section aria-labelledby="readiness-heading" className="space-y-6">
        <div className="flex items-center gap-3 border-l-4 border-indigo-500 pl-4 py-1">
          <div>
            <h2 id="readiness-heading" className="text-2xl font-bold text-[#0B1F3A]">
              Readiness Overview
            </h2>
            <p className="text-sm text-[#64748B]">
              Based on your academic profile, test scores, and experience compared to target universities.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-[#DCE6F2] rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center text-center break-inside-avoid print:border-gray-300 print:shadow-none">
            <div className="relative w-32 h-32 mb-4">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                <path
                  className="text-gray-100"
                  strokeWidth="3"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={readinessScore >= 80 ? "text-emerald-500" : readinessScore >= 50 ? "text-blue-500" : "text-amber-500"}
                  strokeWidth="3"
                  strokeDasharray={`${readinessScore}, 100`}
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-black text-[#0B1F3A]">{readinessScore}%</span>
              </div>
            </div>
            <h3 className="text-lg font-bold text-[#0B1F3A]">Overall Readiness</h3>
          </div>

          <div className="bg-white border border-[#DCE6F2] rounded-2xl p-6 shadow-sm hover:border-emerald-500 transition-all break-inside-avoid print:border-gray-300 print:shadow-none">
            <h3 className="text-lg font-bold text-[#0B1F3A] mb-4 flex items-center gap-2">
              <span className="text-emerald-600 bg-emerald-50 p-2 rounded-lg">🌟</span>
              Key Strengths
            </h3>
            {developmentPlan?.strengths?.length > 0 ? (
              <ul className="space-y-3">
                {developmentPlan.strengths.slice(0, 4).map((strength: string, idx: number) => (
                  <li key={idx} className="flex gap-3 text-sm text-[#0F172A]">
                    <span className="text-emerald-500 font-bold" aria-hidden="true">✓</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#64748B]">No notable strengths highlighted.</p>
            )}
          </div>

          <div className="bg-white border border-[#DCE6F2] rounded-2xl p-6 shadow-sm hover:border-amber-500 transition-all break-inside-avoid print:border-gray-300 print:shadow-none">
            <h3 className="text-lg font-bold text-[#0B1F3A] mb-4 flex items-center gap-2">
              <span className="text-amber-600 bg-amber-50 p-2 rounded-lg">⚡</span>
              Quick Wins
            </h3>
            {developmentPlan?.quick_wins?.length > 0 ? (
              <ul className="space-y-3">
                {developmentPlan.quick_wins.slice(0, 4).map((win: string, idx: number) => (
                  <li key={idx} className="flex gap-3 text-sm text-[#0F172A]">
                    <span className="text-amber-500 font-bold" aria-hidden="true">&bull;</span>
                    <span>{win}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#64748B]">No quick wins highlighted.</p>
            )}
          </div>
        </div>
      </section>

      {/* 1. INTERACTIVE ROADMAP TASKS */}
      <section aria-labelledby="roadmap-tasks-heading" className="space-y-6">
        <div className="flex items-center gap-3 border-l-4 border-[#1D4ED8] pl-4 py-1">
          <div>
            <h2 id="roadmap-tasks-heading" className="text-2xl font-bold text-[#0B1F3A]">
              Your Action Timeline
            </h2>
            <p className="text-sm text-[#64748B]">
              Follow this step-by-step roadmap to bridge your gaps. Progress is saved automatically.
            </p>
          </div>
        </div>
        <RoadmapTaskTracker tasks={roadmapTasks} />
      </section>

      {/* 2. UNIVERSITY MATCH ANALYSIS */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-[#0B1F3A]">University Match Analysis</h2>
        <p className="text-sm text-[#64748B]">
          Detailed breakdown of how your profile compares to admitted student profiles.
        </p>
      </div>

      {BUCKETS.map((bucket) => {
        const bucketItems =
          bucket.key === "achievable"
            ? achievableItems
            : bucket.key === "target"
              ? targetItems
              : ambitiousItems;
        return (
          <section
            aria-labelledby={`${bucket.key}-heading`}
            className="space-y-6"
            key={bucket.key}
          >
            <div className={`flex items-center gap-3 border-l-4 ${bucket.border} pl-4 py-1`}>
              <div>
                <h2 id={`${bucket.key}-heading`} className="text-2xl font-bold text-[#0B1F3A]">
                  {bucket.title}
                </h2>
                <p className="text-sm text-[#64748B]">{bucket.description}</p>
              </div>
              <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${bucket.countPill}`}>
                {bucketItems.length} Programs
              </span>
            </div>

            {bucketItems.length === 0 ? (
              <div className="p-8 bg-[#EFF6FF] border border-[#DCE6F2] rounded-2xl text-center text-sm text-[#64748B]">
                {bucket.empty}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bucketItems.map((item: DisplayItem) => (
                  <article
                    key={item.id}
                    className="bg-white border border-[#DCE6F2] rounded-2xl p-6 flex flex-col shadow-sm text-[#0F172A] hover:border-[#1D4ED8] transition-all duration-200 break-inside-avoid print:border-gray-300 print:shadow-none"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mt-1">
                        {item.country}
                      </span>
                      <div className="flex flex-col items-end gap-1">
                        {item.probability !== null && (
                          <div className={`px-3 py-1.5 rounded-xl font-black text-2xl tracking-tight shadow-sm border ${bucket.scoreBadge}`}>
                            {item.probability}%
                          </div>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${bucket.label}`}>
                          Profile Match
                        </span>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-[#0B1F3A] line-clamp-1" title={item.university}>
                      {item.university}
                    </h3>
                    {item.worldRank && (
                      <p className="text-xs text-[#64748B] mb-2">World Rank: #{item.worldRank}</p>
                    )}
                    <p className="text-sm font-semibold text-[#1D4ED8] mb-3">{item.course}</p>

                    {item.tagline && (
                      <div className="mb-4">
                        <span className="text-xs font-semibold text-[#0B1F3A] uppercase tracking-wider block mb-1">
                          Why this fits
                        </span>
                        <p className="text-sm text-[#64748B] italic bg-gray-50 p-3 rounded-xl border border-gray-100">
                          &ldquo;{item.tagline}&rdquo;
                        </p>
                      </div>
                    )}

                    {item.gaps.length > 0 && (
                      <div className="mt-2 pt-4 border-t border-[#DCE6F2]">
                        <span className="text-xs font-semibold text-[#0B1F3A] uppercase tracking-wider block mb-3">
                          Gap Analysis
                        </span>
                        <div className="space-y-3">
                          {item.gaps.map((gap, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-3 text-sm">
                              <div className="flex flex-wrap justify-between gap-2 font-semibold mb-1">
                                <span className="text-[#0F172A]">{gap.area || gap.category}</span>
                                <div className="flex gap-2">
                                  {gap.type && (
                                    <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                                      {gap.type.replace(/_/g, " ")}
                                    </span>
                                  )}
                                  {gap.gap_level && (
                                    <span className={`text-xs px-2 py-0.5 rounded-md border ${gap.gap_level === "High" ? "bg-red-100 text-red-700 border-red-200" : "bg-orange-100 text-orange-700 border-orange-200"}`}>
                                      {gap.gap_level} Gap
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] mt-2">
                                <span className="bg-white border border-gray-200 px-2 py-1 rounded">Current: {gap.current}</span>
                                <span aria-hidden="true">&rarr;</span>
                                <span className="bg-white border border-gray-200 px-2 py-1 rounded">Target: {gap.target}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.topActions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-[#DCE6F2]">
                        <span className="text-xs font-semibold text-[#0B1F3A] uppercase tracking-wider block mb-2">
                          Top Actions
                        </span>
                        <ul className="space-y-2">
                          {item.topActions.slice(0, 3).map((action, idx) => (
                            <li key={idx} className="flex gap-2 text-xs text-[#64748B] leading-relaxed">
                              <span className="text-[#1D4ED8] font-bold" aria-hidden="true">&bull;</span>
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
