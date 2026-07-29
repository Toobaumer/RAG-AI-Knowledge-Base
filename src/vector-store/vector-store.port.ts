/**
 * A single indexed chunk, ready to be stored in the vector database.
 */
export interface VectorEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, string | number>;
}

/**
 * A single retrieved match from a similarity search.
 */
export interface VectorMatch {
  id: string;
  content: string;
  metadata: Record<string, string | number>;
  distance: number;
}

/**
 * The "port" in a ports-and-adapters (hexagonal) architecture: the rest of
 * the app depends only on this interface, never on ChromaDB directly.
 *
 * This is what makes the "future extensibility" requirement of this
 * project real rather than aspirational - swapping ChromaDB for Pinecone,
 * or adding hybrid search, means writing one new class that implements
 * this interface and changing a single line in VectorStoreModule. Nothing
 * in KnowledgeService or ChatService (RagService) would need to change.
 */
export const VECTOR_STORE = 'VECTOR_STORE';

export interface VectorStorePort {
  /** Adds (or updates, if the id already exists) a batch of chunks. */
  upsert(entries: VectorEntry[]): Promise<void>;

  /** Returns the topK entries most similar to the given embedding. */
  query(embedding: number[], topK: number): Promise<VectorMatch[]>;
}
