export type CourseCategory = "Engineering" | "Arts" | "Business";

export interface Course {
  name: string;
  category: CourseCategory;
}

const engineeringPrograms: string[] = [
  "MS Computer Science", "MS Data Science", "MS Mechanical Engineering", "MS Robotics", 
  "MEng Computer Science", "MEng Mechanical Engineering", "MS Electrical Engineering", 
  "MS Civil Engineering", "MS Aerospace Engineering", "MS Biotechnology", 
  "MS Artificial Intelligence", "MS Software Engineering", "MS Cybersecurity", 
  "MS Information Technology", "MS Biomedical Engineering", "MS Chemical Engineering", 
  "MS Industrial Engineering", "MS Materials Science", "MS Environmental Engineering", 
  "MS Automotive Engineering", "MS Network Engineering", "MEng Electrical Engineering", 
  "MS Mechatronics", "MS Telecommunications", "MS Systems Engineering", 
  "MS Operations Research", "MS Engineering Management", "MS Construction Management", 
  "MS Structural Engineering", "MS Geotechnical Engineering", "MS Transportation Engineering", 
  "MS Water Resources Engineering", "MS Electronics Engineering", "MS VLSI Design", 
  "MS Embedded Systems", "MS Control Systems", "MS Power Systems", "MS Renewable Energy", 
  "MS Nanotechnology", "MS Marine Engineering", "MS Petroleum Engineering", "MS Nuclear Engineering"
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
  "MBA General", "MBA Finance", "MS Business Analytics", "MIM (Master in Management)", 
  "MS Management", "MCA (Master of Computer Applications)", "MS Supply Chain Management", 
  "MS Marketing", "MBA Human Resources", "MS Accounting", "MS Finance", 
  "MBA Entrepreneurship", "MBA International Business", "MS Information Systems", 
  "MBA Healthcare Management", "MBA Strategy", "MBA Operations", "MBA Real Estate", 
  "MBA Agribusiness", "MBA Hospitality Management", "MBA Sports Management", 
  "MBA Luxury Brand Management", "MBA Technology Management", "MS Project Management", 
  "MS Leadership", "MS Organizational Behavior", "MS Human Resource Management", 
  "MS Taxation", "MS Financial Engineering", "MS Quantitative Finance", "MS Marketing Analytics", 
  "MS Consumer Behavior", "MS Innovation and Entrepreneurship", "MS International Management", 
  "MS Logistics", "MS Procurement", "MS Risk Management", "MS Insurance", "MS Actuarial Science", 
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
