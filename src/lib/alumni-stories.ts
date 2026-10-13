/**
 * Students shown in the "Alumni Success Stories" section of the public home
 * page. This list is maintained by hand: edit it here.
 *
 * Photos live in /public/alumni as `<slug>.jpg` (large card) and
 * `<slug>-avatar.jpg` (round thumbnail in the list).
 */

export type AlumniStory = {
  slug: string;
  name: string;
  /** Degree completed at Kumaraguru. */
  degree: string;
  university: string;
  country: string;
  /** Programme joined abroad, when known. */
  program: string | null;
  intake: string;
  /** Kumaraguru batch, when known. */
  batch: string | null;
  scholarship: string | null;
};

export const ALUMNI_STORIES: readonly AlumniStory[] = [
  {
    slug: "abhishek-muthusamy",
    name: "Abhishek Muthusamy",
    degree: "B.E. Mechatronics Engineering",
    university: "Lund University",
    country: "Sweden",
    program: "MSc Embedded Electronics",
    intake: "Fall 2026",
    batch: null,
    scholarship: null,
  },
  {
    slug: "kiran-raghav-j",
    name: "Kiran Raghav J",
    degree: "B.E. Mechanical Engineering",
    university: "Technische Universität Braunschweig",
    country: "Germany",
    program: "MSc Computational Sciences in Engineering",
    intake: "Fall 2026",
    batch: null,
    scholarship: null,
  },
  {
    slug: "pragatheeswari-sivakumar",
    name: "Pragatheeswari Sivakumar",
    degree: "BBA International Business",
    university: "University of Stirling",
    country: "United Kingdom",
    program: "MSc International Business",
    intake: "Fall 2026",
    batch: null,
    scholarship: null,
  },
  {
    slug: "subal-k",
    name: "Subal K",
    degree: "B.E. Electronics and Instrumentation Engineering",
    university: "University of Auckland",
    country: "New Zealand",
    program: "Masters in Robotics and Automation Engineering",
    intake: "Fall 2026",
    batch: null,
    scholarship: null,
  },
  {
    slug: "amrine-ayesha",
    name: "Amrine Ayesha",
    degree: "B.E. Electronics and Instrumentation Engineering",
    university: "Jungwon University",
    country: "South Korea",
    program: null,
    intake: "Fall 2026",
    batch: "2022-2026",
    scholarship: "100% Scholarship",
  },
  {
    slug: "siganesh-sridhar",
    name: "Siganesh Sridhar",
    degree: "B.E. Electrical and Electronics Engineering",
    university: "Jungwon University",
    country: "South Korea",
    program: null,
    intake: "Fall 2026",
    batch: "2022-2026",
    scholarship: "100% Scholarship",
  },
];
