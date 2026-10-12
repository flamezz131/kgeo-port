/* eslint-disable @typescript-eslint/no-explicit-any -- recommendation DB schema runtime mapping */
// supabaseAdmin is not imported at top-level to prevent crashing in Next.js client environments

export interface FormattedStudentContext {
  studentId: string;
  academic: {
    department: string | null;
    cgpa: number | null;
    backlogs: number | null;
    tenthPercentage: number | null;
    twelfthPercentage: number | null;
    currentYear: number | null;
  };
  preferences: {
    preferredCountries: string[];
    preferredCourses: string[];
    sameAsUg: boolean;
    domainSpecializations: string[];
  };
  testScores: any[];
  achievements: {
    projects: any[];
    internships: any[];
    research: any[];
    certifications: any[];
    other: any[];
  };
  resumePath: string | null;
  lastPrGeneratedAt: string | null;
}

export async function loadStudentContextForPR(studentId: string, customDb?: any): Promise<FormattedStudentContext> {
  let publicDb = customDb;
  if (!publicDb) {
    const { supabaseAdmin } = await import('../supabaseAdmin');
    publicDb = supabaseAdmin.schema('public');
  }

  // 1. Fetch Profile
  const { data: profile, error: profileError } = await publicDb
    .from('student_profiles')
    .select('department, cgpa, active_backlogs, cleared_backlogs, sslc_percentage, hsc_percentage, current_year, resume_path, last_pr_generated_at')
    .eq('student_id', studentId)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    throw new Error(`Failed to load student profile: ${profileError.message}`);
  }

  // 2. Fetch Preferences
  const { data: preferences, error: prefError } = await publicDb
    .from('student_preferences')
    .select('preferred_countries, preferred_program_areas, same_as_ug, domain_specializations')
    .eq('student_id', studentId)
    .single();

  if (prefError && prefError.code !== 'PGRST116') { // PGRST116 is no rows returned
    throw new Error(`Failed to load student preferences: ${prefError.message}`);
  }

  // 3. Fetch Test Scores (Entrance Exams)
  const { data: testScores, error: testError } = await publicDb
    .from('student_test_scores')
    .select('*')
    .eq('student_id', studentId);

  if (testError) {
    throw new Error(`Failed to load test scores: ${testError.message}`);
  }

  // 4. Fetch Achievements
  const { data: achievementsRaw, error: achError } = await publicDb
    .from('student_achievements')
    .select('*')
    .eq('student_id', studentId);

  if (achError) {
    throw new Error(`Failed to load achievements: ${achError.message}`);
  }

  const achievements = {
    projects: [] as any[],
    internships: [] as any[],
    research: [] as any[],
    certifications: [] as any[],
    other: [] as any[],
  };

  if (achievementsRaw) {
    for (const ach of achievementsRaw) {
      const type = ach.achievement_type || 'other';
      if (type === 'project') achievements.projects.push(ach);
      else if (type === 'internship') achievements.internships.push(ach);
      else if (type === 'research_paper' || type === 'publication') achievements.research.push(ach);
      else if (type === 'certification') achievements.certifications.push(ach);
      else achievements.other.push(ach);
    }
  }

  return {
    studentId,
    academic: {
      department: profile?.department ?? null,
      cgpa: profile?.cgpa ?? null,
      backlogs: profile?.active_backlogs ?? null,
      tenthPercentage: profile?.sslc_percentage ?? null,
      twelfthPercentage: profile?.hsc_percentage ?? null,
      currentYear: profile?.current_year ?? null,
    },
    preferences: {
      preferredCountries: preferences?.preferred_countries ?? [],
      preferredCourses: preferences?.preferred_program_areas ?? [],
      sameAsUg: preferences?.same_as_ug ?? true,
      domainSpecializations: preferences?.domain_specializations ?? [],
    },
    testScores: testScores || [],
    achievements,
    resumePath: profile?.resume_path ?? null,
    lastPrGeneratedAt: profile?.last_pr_generated_at ?? null,
  };
}
