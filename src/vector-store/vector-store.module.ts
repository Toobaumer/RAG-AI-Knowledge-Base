import { Module } from '@nestjs/common';
import { ChromaVectorStoreService } from './chroma-vector-store.service';
import { VECTOR_STORE } from './vector-store.port';

/**
 * Binds the abstract VECTOR_STORE token to the concrete ChromaDB adapter.
 *
 * To swap in a different vector database later, the change is entirely
 * local to this module: implement VectorStorePort in a new class, and
 * change the `useClass` line below. KnowledgeService and ChatService,
 * which inject VECTOR_STORE, never need to change.
 */
@Module({
  providers: [
    {
      provide: VECTOR_STORE,
      useClass: ChromaVectorStoreService,
    },
  ],
  exports: [VECTOR_STORE],
})
export class VectorStoreModule {}
