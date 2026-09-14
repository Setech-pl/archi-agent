import type { ActorRecord } from "../knowledge-pack.schema.js";
import { CanonicalNameIndex } from "./element-index.js";

/**
 * Index of actors only. Lookup rules are the same as for systems: identifier, exact canonical
 * name and normalized name, all candidates returned sorted by identifier, no automatic choice
 * and no fuzzy matching.
 */
export class ActorIndex extends CanonicalNameIndex<ActorRecord> {
  public static from(actors: readonly ActorRecord[]): ActorIndex {
    return new ActorIndex(actors);
  }
}
