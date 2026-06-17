-- SAT homework app schema (Supabase Postgres).
-- Idempotent: safe to run repeatedly (`npm run migrate`).

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Students: durable identity via a private token (the magic-link portal key).
create table if not exists students (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  token      text not null unique,          -- /s/<token>
  created_at timestamptz not null default now()
);

-- A problem set = authored content, pushed via the CLI. Author-chosen slug id
-- so re-pushing an edited file upserts in place (idempotent authoring).
create table if not exists problem_sets (
  id         text primary key,              -- e.g. "alg-linear-1"
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists problems (
  id          text primary key,             -- "<set_id>:<problem_id>"
  set_id      text not null references problem_sets(id) on delete cascade,
  ordinal     int  not null,                -- order within the set
  type        text not null check (type in ('mc','grid')),
  stem        text not null,                -- prose w/ $..$ math + ![figId] refs
  choices     jsonb not null default '[]',  -- mc: [{ id, content }]
  correct     text,                         -- mc: winning choice id
  answers     jsonb not null default '[]',  -- grid: accepted answer strings
  explanation text,
  figures     jsonb not null default '{}'   -- { figId: "<svg>..." } pre-rendered
);
create index if not exists problems_set_idx on problems(set_id, ordinal);

-- An assignment hands a set to one or more students with a time limit.
create table if not exists assignments (
  id             uuid primary key default gen_random_uuid(),
  set_id         text not null references problem_sets(id),
  title          text,
  time_limit_sec int  not null default 900, -- standardized 15 min
  created_at     timestamptz not null default now()
);

create table if not exists assignment_students (
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  primary key (assignment_id, student_id)
);

-- One sitting per (assignment, student). started_at anchors the
-- server-authoritative timer so a closed tab cannot reset the clock.
create table if not exists attempts (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  token         text not null unique,       -- /hw/<token>
  started_at    timestamptz,                -- stamped on first open
  submitted_at  timestamptz,
  status        text not null default 'not_started'
                check (status in ('not_started','in_progress','submitted','expired')),
  unique (assignment_id, student_id)
);

-- One row per (attempt, problem). Carries the answer + the analytics signal
-- (time on question, how many times the answer changed, mark-for-review).
create table if not exists responses (
  id                uuid primary key default gen_random_uuid(),
  attempt_id        uuid not null references attempts(id) on delete cascade,
  problem_id        text not null references problems(id),
  answer            text,
  is_correct        boolean,
  marked_for_review boolean not null default false,
  time_spent_ms     int not null default 0,
  change_count      int not null default 0,
  updated_at        timestamptz not null default now(),
  unique (attempt_id, problem_id)
);
