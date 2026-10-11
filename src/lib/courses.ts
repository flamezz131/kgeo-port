export type CourseCategory = "Engineering" | "Arts" | "Business";

export interface Course {
  name: string;
  category: CourseCategory;
}

const engineeringPrograms: string[] = [
  "MS Computer Science", "MSc Computer Science", "MS Data Science", "MSc Data Science",
  "MS Mechanical Engineering", "MSc Mechanical Engineering", "MS Robotics", "MSc Robotics",
  "MEng Computer Science", "MEng Mechanical Engineering",
  "MS Electrical Engineering", "MSc Electrical Engineering",
  "MS Civil Engineering", "MSc Civil Engineering",
  "MS Aerospace Engineering", "MSc Aerospace Engineering",
  "MS Biotechnology", "MSc Biotechnology",
  "MS Artificial Intelligence", "MSc Artificial Intelligence",
  "MS Software Engineering", "MSc Software Engineering",
  "MS Cybersecurity", "MSc Cybersecurity",
  "MS Information Technology", "MSc Information Technology",
  "MS Biomedical Engineering", "MSc Biomedical Engineering",
  "MS Chemical Engineering", "MSc Chemical Engineering",
  "MS Industrial Engineering", "MSc Industrial Engineering",
  "MS Materials Science", "MSc Materials Science",
  "MS Environmental Engineering", "MSc Environmental Engineering",
  "MS Automotive Engineering", "MSc Automotive Engineering",
  "MS Network Engineering", "MSc Network Engineering",
  "MEng Electrical Engineering",
  "MS Mechatronics", "MSc Mechatronics",
  "MS Telecommunications", "MSc Telecommunications",
  "MS Systems Engineering", "MSc Systems Engineering",
  "MS Operations Research", "MSc Operations Research",
  "MS Engineering Management", "MSc Engineering Management",
  "MS Construction Management", "MSc Construction Management",
  "MS Structural Engineering", "MSc Structural Engineering",
  "MS Geotechnical Engineering", "MSc Geotechnical Engineering",
  "MS Transportation Engineering", "MSc Transportation Engineering",
  "MS Water Resources Engineering", "MSc Water Resources Engineering",
  "MS Electronics Engineering", "MSc Electronics Engineering",
  "MS VLSI Design", "MSc VLSI Design",
  "MS Embedded Systems", "MSc Embedded Systems",
  "MS Control Systems", "MSc Control Systems",
  "MS Power Systems", "MSc Power Systems",
  "MS Renewable Energy", "MSc Renewable Energy",
  "MS Nanotechnology", "MSc Nanotechnology",
  "MS Marine Engineering", "MSc Marine Engineering",
  "MS Petroleum Engineering", "MSc Petroleum Engineering",
  "MS Nuclear Engineering", "MSc Nuclear Engineering"
];

const artsPrograms: string[] = [
  "MA Economics", "MA Psychology", "MA Literature", "MFA Design", "MPP Public Policy", 
  "MA Sociology", "MA Political Science", "MA Media Studies", "MSc Mathematics", 
  "MA International Relations", "MA History", "MA Communication", "MA Journalism", 
  "MFA Creative Writing", "MFA Fine Arts", "MA Philosophy", "MA Linguistics", 
  "MA Anthropology", "MA Education", "MFA Film Production", "MA Art History", 
  "MA Public Administration", "MA Criminal Justice", "MA Social Work", "MA Urban Planning", 
  "MA Geography", "MA Archaeology", "MA Cultural Studies", "MA Gender Studies", 
  "MA Area Studies", "MA Applied Linguistics", "MA Translation Studies", "MA Digital Humanities", 
  "MA Museum Studies", "MA Arts Administration", "MA Performing Arts", "MA Music", 
  "MA Theatre", "MA Dance", "MA Theology", "MA Religious Studies", "MSc Cognitive Science", 
  "MSc Applied Psychology", "MSc Clinical Psychology", "MSc Industrial-Organizational Psychology"
];

const businessPrograms: string[] = [
  "MBA General", "MBA Finance", "MS Business Analytics", "MSc Business Analytics", "MIM (Master in Management)", 
  "MS Management", "MSc Management", "MCA (Master of Computer Applications)",
  "MS Supply Chain Management", "MSc Supply Chain Management", 
  "MS Marketing", "MSc Marketing", "MBA Human Resources", "MS Accounting", "MSc Accounting",
  "MS Finance", "MSc Finance", 
  "MBA Entrepreneurship", "MBA International Business", "MS Information Systems", "MSc Information Systems",
  "MBA Healthcare Management", "MBA Strategy", "MBA Operations", "MBA Real Estate", 
  "MBA Agribusiness", "MBA Hospitality Management", "MBA Sports Management", 
  "MBA Luxury Brand Management", "MBA Technology Management",
  "MS Project Management", "MSc Project Management", 
  "MS Leadership", "MSc Leadership", "MS Organizational Behavior", "MSc Organizational Behavior",
  "MS Human Resource Management", "MSc Human Resource Management", 
  "MS Taxation", "MSc Taxation", "MS Financial Engineering", "MSc Financial Engineering",
  "MS Quantitative Finance", "MSc Quantitative Finance", "MS Marketing Analytics", "MSc Marketing Analytics",
  "MS Consumer Behavior", "MSc Consumer Behavior", "MS Innovation and Entrepreneurship", "MSc Innovation and Entrepreneurship",
  "MS International Management", "MSc International Management", 
  "MS Logistics", "MSc Logistics", "MS Procurement", "MSc Procurement",
  "MS Risk Management", "MSc Risk Management", "MS Insurance", "MSc Insurance",
  "MS Actuarial Science", "MSc Actuarial Science", 
  "Master of Public Administration (MPA)"
];

export const ALL_COURSES: Course[] = [
  ...engineeringPrograms.map(name => ({ name, category: "Engineering" as CourseCategory })),
  ...artsPrograms.map(name => ({ name, category: "Arts" as CourseCategory })),
  ...businessPrograms.map(name => ({ name, category: "Business" as CourseCategory }))
];

/**
 * Derives the broad category (Engineering, Arts, Business) from the student's UG department/stream.
 */
export function getStudentCategory(initialDepartment: string, stream?: string): CourseCategory {
  const dept = initialDepartment.toLowerCase();
  
  if (dept.includes("bba") || dept.includes("b.com") || dept.includes("commerce") || dept.includes("business") || dept.includes("mba")) {
    return "Business";
  }
  
  // Explicitly check for computer science or data science before generic "science" check
  if (dept.includes("computer") || dept.includes("data") || dept.includes("engineering") || dept.includes("tech") || dept.includes("b.e.") || dept.includes("b.tech")) {
    return "Engineering";
  }
  
  if (dept.includes("b.a.") || dept.includes("b.sc.") || dept.includes("arts") || dept.includes("science")) {
    return "Arts";
  }
  
  // Default to Engineering for most B.E./B.Tech programs at KCT
  return "Engineering";
}
