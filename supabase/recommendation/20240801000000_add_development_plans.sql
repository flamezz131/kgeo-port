create table if not exists recommendation.development_plans (
    id uuid primary key default gen_random_uuid(),
    recommendation_id uuid references recommendation.recommendations(id) on delete cascade not null,
    priority_exams jsonb not null default '[]'::jsonb,
    language_requirements jsonb not null default '[]'::jsonb,
    suggested_internships jsonb not null default '[]'::jsonb,
    suggested_certifications jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

-- Enable RLS (Assuming standard setup)
alter table recommendation.development_plans enable row level security;

create policy "Users can view their own development plans"
    on recommendation.development_plans
    for select
    using (
        recommendation_id in (
            select id from recommendation.recommendations where student_id = auth.uid()
        )
    );
