const fs = require('fs');
const path = require('path');

const prDir = 'D:\\kgeo\\PR';
if (fs.existsSync(prDir)) {
  fs.rmSync(prDir, { recursive: true, force: true });
}
fs.mkdirSync(prDir, { recursive: true });

console.log('Copying backend...');
const backendSrc = 'D:\\kgeo\\kgeo-backend';
const backendDest = path.join(prDir, 'backend');
fs.mkdirSync(backendDest, { recursive: true });

function copyRecursive(src, dest, ignoreList) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  const name = path.basename(src);
  if (ignoreList.includes(name)) return;

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const children = fs.readdirSync(src);
    for (const child of children) {
      copyRecursive(path.join(src, child), path.join(dest, child), ignoreList);
    }
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(backendSrc, backendDest, ['node_modules', '.env']);

const backendEnvExample = `PORT=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
INTERNAL_API_SECRET=
`;
fs.writeFileSync(path.join(backendDest, '.env.example'), backendEnvExample);

console.log('Copying web files...');
const webIntegrationDest = path.join(prDir, 'web-integration');
fs.mkdirSync(webIntegrationDest, { recursive: true });

const prWebFiles = [
  'src/app/student/pr',
  'src/app/api/recommendations',
  'src/components/CountryCombobox.tsx',
  'src/components/CourseCombobox.tsx',
  'src/lib/countries.ts',
  'src/lib/uploadMarksheet.ts',
];

const webRoot = 'D:\\kgeo\\web\\K-GEO';
for (const relPath of prWebFiles) {
  const fullSrc = path.join(webRoot, relPath);
  if (fs.existsSync(fullSrc)) {
    const fullDest = path.join(webIntegrationDest, relPath);
    copyRecursive(fullSrc, fullDest, []);
  }
}

const libDir = path.join(webRoot, 'src/lib');
if (fs.existsSync(libDir)) {
  const libFiles = fs.readdirSync(libDir);
  for (const file of libFiles) {
    if (file.toLowerCase().includes('schema') && file.toLowerCase().includes('pr')) {
      copyRecursive(path.join(libDir, file), path.join(webIntegrationDest, 'src/lib', file), []);
    }
  }
}

console.log('Creating shared snippets...');
const snippetsDest = path.join(prDir, 'web-integration-snippets');
fs.mkdirSync(snippetsDest, { recursive: true });

const dashboardSnippet = `// From src/app/student/dashboard/page.tsx
// Insert this inside <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"> alongside the Profile completion card

          <div className="bg-[#EFF6FF] border border-[#DCE6F2] rounded-2xl p-6 flex flex-col justify-between text-[#0F172A] shadow-sm">
            <div>
              <span className="text-[#1D4ED8] font-semibold text-sm uppercase tracking-wider">AI Recommendation Engine</span>
              <h2 className="text-[#0B1F3A] text-2xl font-bold mt-2">Get My Personalized Roadmap</h2>
              <p className="text-[#64748B] mt-2">
                Discover your 20-25 best-fit university programs categorized into Safe, Match, and Reach buckets with actionable AI guidance tailored to your academic profile.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#DCE6F2] flex items-center justify-between">
              <span className="text-[#64748B] text-sm font-medium">Powered by Gemini AI</span>
              <Link className="inline-flex items-center justify-center bg-[#1D4ED8] hover:bg-[#0B1F3A] text-white px-5 py-2.5 rounded-lg font-medium transition-colors no-underline" href="/student/pr/roadmap">
                Get My Personalized Roadmap
              </Link>
            </div>
          </div>
`;
fs.writeFileSync(path.join(snippetsDest, 'student-dashboard-snippet.tsx'), dashboardSnippet);

console.log('Copying migrations...');
const migrationsSrc = path.join(webRoot, 'supabase/migrations');
const migrationsDest = path.join(prDir, 'supabase/migrations');
if (fs.existsSync(migrationsSrc)) {
  fs.mkdirSync(migrationsDest, { recursive: true });
  const migrations = fs.readdirSync(migrationsSrc);
  for (const m of migrations) {
    if (m.includes('recommendation') || m.includes('pr_intake') || m.includes('development_plan') || m.includes('error_message')) {
      fs.copyFileSync(path.join(migrationsSrc, m), path.join(migrationsDest, m));
    }
  }
}

console.log('Creating frontend .env.example...');
const webEnvExample = `NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
INTERNAL_API_SECRET=
PR_BACKEND_URL=
`;
fs.writeFileSync(path.join(webIntegrationDest, '.env.example'), webEnvExample);

console.log('Stage 1 Packaging Complete!');
