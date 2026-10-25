/**
 * Pure calculations for the two current feedback choices. These helpers turn reactions into
 * counts and a sorting score; they do not query the database or expose learner names.
 */
type Reaction = { learnerId: number; lessonConceptId: number; reaction: string };
export type Understanding = { understood: number; notUnderstood: number; responses: number; noResponse: number };

// Historical "not sure" responses remain stored, but are not binary responses.
/**
 * Count the two supported reactions for one lesson-concept association; retained legacy
 * reactions do not become a third current choice.
 */
export function conceptUnderstanding(lessonConceptId: number, reactions: Reaction[], totalLearners: number): Understanding {
  const responses = new Map(reactions.filter(row => row.lessonConceptId === lessonConceptId && ['understood', 'didnt_understand'].includes(row.reaction)).map(row => [row.learnerId, row.reaction]));
  const understood = [...responses.values()].filter(value => value === 'understood').length;
  return { understood, notUnderstood: responses.size - understood, responses: responses.size, noResponse: Math.max(0, totalLearners - responses.size) };
}

/**
 * Produce the sort value used for least-understood concepts first, with deliberate handling
 * for no responses.
 */
export function understandingScore(counts: Understanding) {
  return counts.responses ? counts.understood / counts.responses : Infinity;
}
