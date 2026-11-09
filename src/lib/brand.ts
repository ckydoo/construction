/* Single source of truth for the product identity.
   Internal infrastructure identifiers (Supabase bucket, localStorage keys,
   CLI project_id, repo/workspace paths) intentionally keep their historical
   `buildops*` names so live storage, saved themes and deployment stay intact. */
export const BRAND = {
  name: 'MYLA',
  motto: 'Built for Progress.',
  descriptor: 'CONSTRUCTION & INDUSTRIAL MANAGEMENT',
  descriptorTitleCase: 'Construction & Industrial Management',
  title: 'MYLA — Construction & Industrial Management',
  description: 'Built for Progress. Full-stack construction and industrial management for teams from micro to enterprise.',
} as const;
