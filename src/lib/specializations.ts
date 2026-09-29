export const COURSE_SPECIALIZATION_MAP = {
  CS_IT: [
    "Artificial Intelligence", "Machine Learning", "Deep Learning", "Natural Language Processing",
    "Computer Vision", "Data Science", "Big Data Analytics", "Data Engineering",
    "Software Engineering", "Full Stack Web Development", "Mobile App Development",
    "Cybersecurity", "Information Security", "Network Security", "Cryptography",
    "Cloud Computing", "Distributed Systems", "Edge Computing",
    "Human-Computer Interaction", "UI/UX Design", "Virtual Reality (VR)", "Augmented Reality (AR)",
    "Game Development", "Blockchain Technology", "Quantum Computing", "Bioinformatics",
    "Internet of Things (IoT)", "Computer Graphics", "Database Management Systems",
    "Software Testing & Quality Assurance", "DevOps & SRE"
  ],
  MECHANICAL: [
    "Robotics", "Automation", "Mechatronics",
    "Mechanical Design", "Computer-Aided Design (CAD)", "Finite Element Analysis (FEA)",
    "Manufacturing Processes", "Additive Manufacturing (3D Printing)", "Computer-Integrated Manufacturing",
    "Thermal Engineering", "Fluid Mechanics", "Computational Fluid Dynamics (CFD)",
    "Heat Transfer", "HVAC Systems",
    "Automotive Engineering", "Vehicle Dynamics", "Electric & Hybrid Vehicles",
    "Aerospace Engineering", "Aerodynamics", "Propulsion Systems",
    "Acoustics & Vibrations", "Tribology", "Biomechanics"
  ],
  ELECTRICAL: [
    "Electrical Power Systems", "Power Electronics", "Smart Grids", "Renewable Energy Systems",
    "VLSI Design", "Embedded Systems", "Microcontrollers & Microprocessors",
    "Telecommunications", "Wireless Communications", "Optical Communications",
    "Control Systems", "Automation & Instrumentation",
    "Signal Processing", "Digital Signal Processing", "Image Processing",
    "Microelectronics", "Nanoelectronics", "Electromagnetics",
    "RF & Microwave Engineering", "Photonics"
  ],
  CIVIL: [
    "Structural Engineering", "Earthquake Engineering", "Bridge Engineering",
    "Construction Management", "Construction Materials",
    "Environmental Engineering", "Water & Wastewater Treatment", "Solid Waste Management",
    "Transportation Engineering", "Traffic Engineering", "Pavement Design",
    "Geotechnical Engineering", "Soil Mechanics", "Foundation Engineering",
    "Water Resources Engineering", "Hydrology", "Coastal Engineering",
    "Urban Planning", "Smart Cities", "Surveying & Geomatics",
    "Geographic Information Systems (GIS)", "Remote Sensing"
  ],
  OTHER_ENGINEERING: [
    "Chemical Engineering", "Process Engineering", "Polymers & Plastics",
    "Materials Science", "Metallurgy", "Composite Materials", "Nanomaterials",
    "Biomedical Engineering", "Medical Imaging", "Prosthetics", "Tissue Engineering",
    "Biotechnology", "Genetic Engineering", "Biochemical Engineering",
    "Nanotechnology", "Marine Engineering", "Naval Architecture",
    "Petroleum Engineering", "Reservoir Engineering", "Nuclear Engineering",
    "Industrial Engineering", "Operations Research", "Ergonomics"
  ],
  BUSINESS_MBA: [
    "Corporate Finance", "Investment Banking", "Wealth Management", "Financial Risk Management",
    "Marketing Strategy", "Digital Marketing", "Brand Management", "Consumer Behavior",
    "Human Resource Management", "Organizational Behavior", "Talent Acquisition",
    "Operations Management", "Supply Chain Management", "Logistics", "Procurement",
    "Business Analytics", "Data-Driven Decision Making", "Market Research",
    "International Business", "Global Strategy", "Trade & Customs",
    "Entrepreneurship", "Innovation Management", "Venture Capital",
    "Strategic Management", "Consulting", "Change Management",
    "Healthcare Management", "Hospital Administration",
    "Project Management", "Agile Methodologies", "Real Estate Management",
    "Sports Management", "Hospitality Management", "Luxury Brand Management"
  ],
  ARTS_HUMANITIES: [
    "Literature", "Creative Writing", "Comparative Literature",
    "Psychology", "Clinical Psychology", "Cognitive Psychology", "Behavioral Science",
    "Economics", "Applied Economics", "Microeconomics", "Macroeconomics", "Econometrics",
    "Graphic Design", "Interaction Design (UI/UX)", "Visual Arts",
    "Media Studies", "Communication Studies", "Digital Media",
    "Journalism", "Public Relations", "Corporate Communications",
    "Sociology", "Social Work", "Criminology",
    "Political Science", "Public Policy", "International Relations", "Diplomacy",
    "History", "Cultural Studies", "Anthropology", "Archaeology",
    "Philosophy", "Ethics", "Logic",
    "Linguistics", "Applied Linguistics", "Translation Studies",
    "Fine Arts", "Studio Arts", "Art History",
    "Performing Arts", "Theater", "Musicology", "Dance",
    "Education", "Curriculum Design", "Special Education", "Educational Technology",
    "Museum Studies", "Curation", "Arts Administration",
    "Gender Studies", "Women's Studies",
    "Environmental Studies", "Sustainability",
    "Film Production", "Television Production", "Video Production"
  ]
};

export function getSpecializationsForCourses(courses: string[], stream: string): string[] {
  if (!courses || courses.length === 0) {
    // Fallback if no courses selected
    return stream === "engineering" ? [
      ...COURSE_SPECIALIZATION_MAP.CS_IT,
      ...COURSE_SPECIALIZATION_MAP.MECHANICAL,
      ...COURSE_SPECIALIZATION_MAP.ELECTRICAL,
      ...COURSE_SPECIALIZATION_MAP.CIVIL,
      ...COURSE_SPECIALIZATION_MAP.OTHER_ENGINEERING
    ] : [
      ...COURSE_SPECIALIZATION_MAP.ARTS_HUMANITIES,
      ...COURSE_SPECIALIZATION_MAP.BUSINESS_MBA
    ];
  }

  const specs = new Set<string>();

  for (const course of courses) {
    const c = course.toLowerCase();
    
    // CS / IT
    if (c.includes("computer") || c.includes("software") || c.includes("data") || c.includes("artificial intelligence") || c.includes("cybersecurity") || c.includes("information tech") || c.includes("network")) {
      COURSE_SPECIALIZATION_MAP.CS_IT.forEach(s => specs.add(s));
    }
    // Mechanical
    else if (c.includes("mechanical") || c.includes("automotive") || c.includes("aerospace") || c.includes("robotics") || c.includes("mechatronics") || c.includes("industrial")) {
      COURSE_SPECIALIZATION_MAP.MECHANICAL.forEach(s => specs.add(s));
    }
    // Electrical / Electronics
    else if (c.includes("electrical") || c.includes("electronics") || c.includes("vlsi") || c.includes("power") || c.includes("telecommunications") || c.includes("embedded") || c.includes("control systems")) {
      COURSE_SPECIALIZATION_MAP.ELECTRICAL.forEach(s => specs.add(s));
    }
    // Civil
    else if (c.includes("civil") || c.includes("structural") || c.includes("construction") || c.includes("environmental") || c.includes("water") || c.includes("transportation") || c.includes("geotechnical") || c.includes("urban")) {
      COURSE_SPECIALIZATION_MAP.CIVIL.forEach(s => specs.add(s));
    }
    // Other Engineering
    else if (c.includes("chemical") || c.includes("materials") || c.includes("biomedical") || c.includes("biotechnology") || c.includes("nanotechnology") || c.includes("marine") || c.includes("petroleum") || c.includes("nuclear")) {
      COURSE_SPECIALIZATION_MAP.OTHER_ENGINEERING.forEach(s => specs.add(s));
    }
    // Business / MBA / Management
    else if (c.includes("mba") || c.includes("management") || c.includes("business") || c.includes("finance") || c.includes("accounting") || c.includes("marketing") || c.includes("supply chain") || c.includes("human resource") || c.includes("logistics")) {
      COURSE_SPECIALIZATION_MAP.BUSINESS_MBA.forEach(s => specs.add(s));
    }
    // Arts / Humanities / Science
    else {
      // Default fallback for anything else (mostly arts/sciences based on the list)
      COURSE_SPECIALIZATION_MAP.ARTS_HUMANITIES.forEach(s => specs.add(s));
    }
  }

  // If we couldn't match any specific category, provide a fallback based on the stream
  if (specs.size === 0) {
    return stream === "engineering" ? [
      ...COURSE_SPECIALIZATION_MAP.CS_IT,
      ...COURSE_SPECIALIZATION_MAP.MECHANICAL,
      ...COURSE_SPECIALIZATION_MAP.ELECTRICAL,
      ...COURSE_SPECIALIZATION_MAP.CIVIL,
      ...COURSE_SPECIALIZATION_MAP.OTHER_ENGINEERING
    ] : [
      ...COURSE_SPECIALIZATION_MAP.ARTS_HUMANITIES,
      ...COURSE_SPECIALIZATION_MAP.BUSINESS_MBA
    ];
  }

  return Array.from(specs);
}

/**
 * Every specialization across all course categories, de-duplicated and sorted.
 *
 * `getSpecializationsForCourses` narrows the list to a student's chosen courses
 * and is what the PR intake wizard uses. The profile Preferences section has no
 * course context at that point, so it offers the full catalogue instead.
 */
export function getAllSpecializations(): string[] {
  const specs = new Set<string>();
  for (const category of Object.values(COURSE_SPECIALIZATION_MAP)) {
    for (const spec of category) {
      specs.add(spec);
    }
  }
  return Array.from(specs).sort((a, b) => a.localeCompare(b));
}
