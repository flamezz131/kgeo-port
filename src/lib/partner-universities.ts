/**
 * K-GEO partner universities, shown in the "Explore Top Destinations" section
 * of the public home page. This list is maintained by hand: edit it here.
 */

export const PARTNER_REGIONS = [
  "Asia",
  "Europe",
  "Americas",
  "Middle East & Africa",
  "Oceania",
] as const;

export type PartnerRegion = (typeof PARTNER_REGIONS)[number];

export type PartnerCountry = {
  country: string;
  region: PartnerRegion;
  /** Where the country's marker sits on the partner map. */
  lat: number;
  lon: number;
  universities: readonly string[];
};

export const PARTNER_COUNTRIES: readonly PartnerCountry[] = [
  {
    country: "Australia",
    region: "Oceania",
    lat: -25.0,
    lon: 134.0,
    universities: ["James Cook University", "Griffith University"],
  },
  {
    country: "Bangladesh",
    region: "Asia",
    lat: 23.8,
    lon: 90.4,
    universities: ["BUFT"],
  },
  {
    country: "Brunei",
    region: "Asia",
    lat: 4.6,
    lon: 114.7,
    universities: ["Universiti Teknologi Brunei"],
  },
  {
    country: "Cameroon",
    region: "Middle East & Africa",
    lat: 5.5,
    lon: 12.4,
    universities: ["PKFokam Institute of Excellence"],
  },
  {
    country: "China",
    region: "Asia",
    lat: 35.0,
    lon: 105.0,
    universities: ["Tiangong University"],
  },
  {
    country: "Croatia",
    region: "Europe",
    lat: 45.4,
    lon: 16.0,
    universities: ["Algebra Bernays University"],
  },
  {
    country: "Czech Republic",
    region: "Europe",
    lat: 49.9,
    lon: 15.4,
    universities: ["Technical University of Liberec"],
  },
  {
    country: "France",
    region: "Europe",
    lat: 46.6,
    lon: 2.4,
    universities: ["Ecole de design - Intuit Lab"],
  },
  {
    country: "Germany",
    region: "Europe",
    lat: 51.3,
    lon: 10.2,
    universities: [
      "RWTH Aachen University - ITA",
      "RWTH Aachen University - International Academy",
    ],
  },
  {
    country: "Hungary",
    region: "Europe",
    lat: 47.2,
    lon: 19.6,
    universities: ["Eötvös Loránd University"],
  },
  {
    country: "Indonesia",
    region: "Asia",
    lat: -6.2,
    lon: 106.8,
    universities: ["Universitas Multimedia Nusantara"],
  },
  {
    country: "Israel",
    region: "Middle East & Africa",
    lat: 31.3,
    lon: 34.9,
    universities: ["Ben Gurion University"],
  },
  {
    country: "Italy",
    region: "Europe",
    lat: 42.6,
    lon: 12.6,
    universities: ["Istituto Secoli"],
  },
  {
    country: "Malaysia",
    region: "Asia",
    // Northern peninsula, so the marker stays clear of Singapore's.
    lat: 5.4,
    lon: 101.4,
    universities: [
      "Asia Pacific University of Technology and Innovation",
      "Mahsa University",
      "Taylor's University",
      "Multimedia University",
    ],
  },
  {
    country: "Singapore",
    region: "Asia",
    lat: 1.35,
    lon: 103.8,
    universities: ["James Cook University - Singapore Campus"],
  },
  {
    country: "South Korea",
    region: "Asia",
    lat: 36.4,
    lon: 127.9,
    universities: ["University of Seoul", "Jungwon University"],
  },
  {
    country: "Sri Lanka",
    region: "Asia",
    lat: 7.6,
    lon: 80.7,
    universities: ["Sri Lanka Institute of Textile and Apparel (SLITA)"],
  },
  {
    country: "Sweden",
    region: "Europe",
    lat: 59.5,
    lon: 15.2,
    universities: ["Jönköping University"],
  },
  {
    country: "Taiwan",
    region: "Asia",
    lat: 23.7,
    lon: 121.0,
    universities: ["National Dong Hwa University"],
  },
  {
    country: "United Arab Emirates",
    region: "Middle East & Africa",
    lat: 24.2,
    lon: 54.4,
    universities: ["Skyline University College"],
  },
  {
    country: "United Kingdom",
    region: "Europe",
    lat: 53.0,
    lon: -1.6,
    universities: [
      "University of Huddersfield",
      "Manchester Metropolitan University",
      "University of Nottingham",
      "University of Reading",
    ],
  },
  {
    country: "United States of America",
    region: "Americas",
    lat: 39.5,
    lon: -98.4,
    universities: [
      "Rochester Institute of Technology",
      "Texas Tech University",
      "Northeastern University",
      "George Washington University",
    ],
  },
  {
    country: "Vietnam",
    region: "Asia",
    lat: 10.8,
    lon: 106.7,
    universities: ["Ho Chi Minh University of Technology (HUTECH)"],
  },
];

export const PARTNER_UNIVERSITY_COUNT = PARTNER_COUNTRIES.reduce(
  (total, entry) => total + entry.universities.length,
  0,
);

export function partnerUniversityLabel(count: number): string {
  return count === 1 ? "1 partner university" : `${count} partner universities`;
}

export function getPartnerUniversities(country: string): readonly string[] {
  return (
    PARTNER_COUNTRIES.find((entry) => entry.country === country)
      ?.universities ?? []
  );
}
