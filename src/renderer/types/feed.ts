export type Post = {
  id: string;
  title: string;
  body: string;
  timestamp?: string; // ISO 8601 UTC timestamp
  author?: string;
};
