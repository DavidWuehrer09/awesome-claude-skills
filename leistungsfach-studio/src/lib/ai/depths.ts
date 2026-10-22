export const REVISION_DEPTHS = ["corrections", "targeted", "exemplary"] as const;
export type RevisionDepth = (typeof REVISION_DEPTHS)[number];
