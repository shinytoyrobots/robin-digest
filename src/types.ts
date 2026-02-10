export interface PipelineConfig {
  id: string;
  name: string;
  index_url?: string;
  max_snippets: number;
  curation_prompt: string;
}

export interface Pipeline {
  id: string;
  name: string;
  index_url: string | null;
  curation_prompt: string;
  max_snippets: number;
  enabled: number;
  created_at: string;
}

export interface Source {
  id: number;
  pipeline_id: string;
  name: string;
  url: string;
  feed_url: string | null;
  feed_type: string | null;
  enabled: number;
  last_fetched_at: string | null;
}

export interface Article {
  id: number;
  source_id: number;
  url: string;
  title: string;
  author: string | null;
  published_at: string | null;
  content: string;
  fetched_at: string;
}

export interface Digest {
  id: number;
  pipeline_id: string;
  title: string;
  created_at: string;
}

export interface Snippet {
  id: number;
  digest_id: number;
  key_insight: string;
  source_article_id: number | null;
  source_url: string;
  source_name: string;
  position: number;
}

export interface CuratedSnippet {
  key_insight: string;
  source_url: string;
  source_name: string;
  source_article_id?: number;
}

export interface FeedInfo {
  url: string;
  type: "rss" | "atom";
}

export interface FetchedArticle {
  url: string;
  title: string;
  author?: string;
  published_at?: string;
  content: string;
}

export interface PipelineRunResult {
  pipeline_id: string;
  sources_discovered: number;
  articles_fetched: number;
  digest_id: number | null;
  snippets_created: number;
  errors: string[];
}
