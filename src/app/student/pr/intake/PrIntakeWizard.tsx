"use client";
/* eslint-disable react-hooks/purity -- cooldown is computed from the current time, as in K-GEO-merge2. */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadResume } from "@/lib/uploadResume";
import { linkResumeToProfile, removeResume } from "@/app/actions/resume-actions";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FileText, UploadCloud, CheckCircle, Trash2 } from "lucide-react";

import { FormattedStudentContext } from "@/lib/recommendations/loadStudentContext";

interface PrIntakeWizardProps {
  studentId: string;
  studentContext: FormattedStudentContext; 
}

export function PrIntakeWizard({
  studentId,
  studentContext,
}: PrIntakeWizardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [resumePath, setResumePath] = useState<string | undefined>(studentContext.resumePath || undefined);
  const [resumeUploading, setResumeUploading] = useState<boolean>(false);
  const [resumeRemoving, setResumeRemoving] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const ctx = studentContext;
  const isProfileComplete =
    ctx.academic?.cgpa !== null &&
    ctx.academic?.department !== null &&
    ctx.preferences?.preferredCountries?.length > 0 &&
    ctx.preferences?.preferredCourses?.length > 0;

  const lastGeneratedAt = ctx.lastPrGeneratedAt ? new Date(ctx.lastPrGeneratedAt) : null;
  const cooldownMs = 7 * 24 * 60 * 60 * 1000;
  const isCooldownActive = lastGeneratedAt && (Date.now() - lastGeneratedAt.getTime() < cooldownMs);
  const nextGenerationDate = lastGeneratedAt ? new Date(lastGeneratedAt.getTime() + cooldownMs) : null;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  const processFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      alert("Resume must be a PDF file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Resume must be under 5MB.");
      return;
    }

    setResumeUploading(true);
    try {
      const path = await uploadResume(file, studentId);
      const linkRes = await linkResumeToProfile(studentId, path);
      if (!linkRes.success) throw new Error(linkRes.error);
      setResumePath(path);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Unable to upload your resume. Please try again.");
    } finally {
      setResumeUploading(false);
    }
  };

  const handleResumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (resumePath) {
      alert("You already have a resume uploaded. Remove it before uploading a new one.");
      return;
    }

    await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (resumePath) {
      alert("You already have a resume uploaded. Remove it before uploading a new one.");
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleRemoveResume = async () => {
    if (!resumePath) return;
    setResumeRemoving(true);
    try {
      const res = await removeResume(studentId, resumePath);
      if (!res.success) throw new Error(res.error);
      setResumePath(undefined);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Unable to remove the resume. Please try again.");
    } finally {
      setResumeRemoving(false);
    }
  };

  const handleNext = () => {
    setError(null);
    setStep(2);
  };

  const handleBack = () => {
    setError(null);
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProfileComplete) return;

    setError(null);
    setLoading(true);

    // Removed buggy PR intake database update here.
    // The resume is now immediately persisted to student_profiles upon upload via linkResumeToProfile.

    // 2. Trigger Roadmap Generation
    try {
      const res = await fetch("/api/recommendations/pr-generate", {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Submission failed" }));
        const errorMsg = errData.error || (errData.details && JSON.stringify(errData.details)) || "An unexpected error occurred.";
        setError(errorMsg);
        setLoading(false);
        return;
      }

      router.push("/student/pr/generating");
    } catch (err) {
      console.error("Submission error:", err);
      setError("Failed to start generation. Please check your network and try again.");
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-[#DCE6F2] rounded-2xl p-6 md:p-8 shadow-sm text-[#0F172A]">
      {/* Progress Header */}
      <div className="mb-6 pb-6 border-b border-[#DCE6F2]">
        <div className="mb-2">
          <span className="text-xs font-medium text-[#64748B]">
            {step === 1 && "Resume Upload"}
            {step === 2 && "Review & Generate"}
          </span>
        </div>
        <div className="w-full bg-[#EFF6FF] h-2 rounded-full overflow-hidden">
          <div
            className="bg-[#1D4ED8] h-full transition-all duration-300 ease-out"
            style={{ width: `${(step / 2) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!isProfileComplete && step === 2 && (
        <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-xl">
          <h3 className="text-amber-800 font-bold mb-2">Incomplete Profile Detected</h3>
          <p className="text-sm text-amber-700 mb-3">
            Your profile is missing some required information to generate an accurate roadmap. 
            Please ensure you have completed your academic details and study preferences.
          </p>
          <Link 
            href="/student/profile" 
            className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Go to Profile
          </Link>
        </div>
      )}

      <div className="space-y-6">
        {/* STEP 1: RESUME UPLOAD */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-[#1D4ED8]" />
              <h2 className="text-xl font-bold text-[#0B1F3A]">Upload Your Resume</h2>
            </div>
            <p className="text-sm text-[#64748B]">
              Your resume provides crucial context about your skills and experiences that aren&apos;t captured elsewhere.
            </p>
            
            <div 
              className={`relative border-2 border-dashed rounded-xl p-8 transition-colors ${
                isDragging ? "border-[#1D4ED8] bg-[#EFF6FF]" : "border-[#DCE6F2] bg-gray-50 hover:border-[#93C5FD]"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 bg-[#EFF6FF] rounded-full">
                  <UploadCloud className="w-8 h-8 text-[#1D4ED8]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#0F172A]">Drag and drop your resume here</h3>
                  <p className="text-xs text-[#64748B] mt-1">PDF, max 5MB</p>
                </div>
                
                <div className="relative">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleResumeChange}
                    disabled={resumeUploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    id="resume-upload-input"
                  />
                  <label 
                    htmlFor="resume-upload-input"
                    className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-[#1D4ED8] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-lg transition-colors cursor-pointer"
                  >
                    Choose a file
                  </label>
                </div>

                {resumeUploading && (
                  <p className="text-xs text-[#1D4ED8] font-medium animate-pulse">Uploading...</p>
                )}
              </div>

              {resumePath && !resumeUploading && (
                <div className="mt-6 p-4 bg-white border border-[#DCE6F2] rounded-lg flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <span className="block text-sm font-semibold text-[#0F172A]">Resume uploaded</span>
                      <span className="block text-xs text-[#64748B]">Successfully attached to your profile</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveResume}
                    disabled={resumeRemoving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {resumeRemoving ? "Removing..." : "Remove"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW & GENERATE */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#0B1F3A] mb-1">Final Review</h2>
              <p className="text-sm text-[#64748B]">
                This is a summary of the data we&apos;ll use to generate your personalized roadmap. 
                If anything looks incorrect, please update it in your <Link href="/student/profile" className="text-[#1D4ED8] hover:underline">Profile</Link>.
              </p>
            </div>

            {isCooldownActive && lastGeneratedAt && nextGenerationDate && (
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 shadow-sm">
                <h3 className="font-bold text-base mb-1">Your personalized recommendation is available.</h3>
                <p className="text-sm mb-1">Generated on: <span className="font-semibold">{formatDate(lastGeneratedAt)}</span></p>
                <p className="text-sm mb-2">Next regeneration available: <span className="font-semibold">{formatDate(nextGenerationDate)}</span></p>
                <p className="text-xs text-blue-700">Your current recommendation remains available until you can generate an updated version.</p>
                
                <Link href="/student/pr/roadmap" className="inline-block mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
                  View Current Recommendation
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[#DCE6F2] bg-gray-50">
                <h3 className="text-sm font-bold text-[#0F172A] mb-2">Academic Profile</h3>
                <ul className="text-sm text-[#475569] space-y-1">
                  <li><span className="font-medium text-[#0F172A]">Department:</span> {ctx.academic?.department || "Not provided"}</li>
                  <li><span className="font-medium text-[#0F172A]">CGPA:</span> {ctx.academic?.cgpa || "Not provided"}</li>
                  <li><span className="font-medium text-[#0F172A]">Active Backlogs:</span> {ctx.academic?.backlogs ?? "Not provided"}</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl border border-[#DCE6F2] bg-gray-50">
                <h3 className="text-sm font-bold text-[#0F172A] mb-2">Study Preferences</h3>
                <ul className="text-sm text-[#475569] space-y-1">
                  <li><span className="font-medium text-[#0F172A]">Countries:</span> {ctx.preferences?.preferredCountries?.join(", ") || "None"}</li>
                  <li><span className="font-medium text-[#0F172A]">Courses:</span> {ctx.preferences?.preferredCourses?.join(", ") || "None"}</li>
                  <li><span className="font-medium text-[#0F172A]">Switching Fields:</span> {ctx.preferences?.sameAsUg ? "No" : "Yes"}</li>
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-[#DCE6F2] bg-gray-50">
              <h3 className="text-sm font-bold text-[#0F172A] mb-2">Experience & Achievements</h3>
              <p className="text-sm text-[#475569] whitespace-pre-wrap leading-relaxed">
                {ctx.achievements 
                  ? `${ctx.achievements.projects?.length || 0} projects, ${ctx.achievements.internships?.length || 0} internships, ${ctx.achievements.research?.length || 0} research items, ${ctx.achievements.certifications?.length || 0} certifications`
                  : "No achievements or experience recorded."}
              </p>
            </div>
            
            {ctx.testScores && ctx.testScores.length > 0 && (
              <div className="p-4 rounded-xl border border-[#DCE6F2] bg-gray-50">
                <h3 className="text-sm font-bold text-[#0F172A] mb-2">Entrance Exams</h3>
                <ul className="text-sm text-[#475569] space-y-1">
                  {ctx.testScores.map((ts, i: number) => (
                    <li key={i}>
                      <span className="font-medium text-[#0F172A]">{ts.exam_name}:</span> {ts.score || ts.exam_status}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* FOOTER ACTIONS */}
        <div className="pt-6 border-t border-[#DCE6F2] flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg border border-[#DCE6F2] text-[#0F172A] font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 2 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 rounded-lg bg-[#1D4ED8] hover:bg-[#0B1F3A] text-white font-medium transition-colors shadow-sm"
            >
              Review Summary &rarr;
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || resumeUploading || !isProfileComplete || !!isCooldownActive}
              className="px-6 py-2.5 rounded-lg bg-[#1D4ED8] hover:bg-[#0B1F3A] text-white font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading 
                ? "Submitting..." 
                : resumeUploading 
                  ? "Uploading..." 
                  : isCooldownActive 
                    ? `Next generation available ${nextGenerationDate ? formatDate(nextGenerationDate) : ''}`
                    : "Generate My Roadmap"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
