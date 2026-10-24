type Reaction = { learnerId: number; lessonConceptId: number; reaction: string };
export type Understanding = { understood: number; notUnderstood: number; responses: number; noResponse: number };

// Historical "not sure" responses remain stored, but are not binary responses.
export function conceptUnderstanding(lessonConceptId: number, reactions: Reaction[], totalLearners: number): Understanding {
  const responses = new Map(reactions.filter(row => row.lessonConceptId === lessonConceptId && ['understood', 'didnt_understand'].includes(row.reaction)).map(row => [row.learnerId, row.reaction]));
  const understood = [...responses.values()].filter(value => value === 'understood').length;
  return { understood, notUnderstood: responses.size - understood, responses: responses.size, noResponse: Math.max(0, totalLearners - responses.size) };
}

export function understandingScore(counts: Understanding) {
  return counts.responses ? counts.understood / counts.responses : Infinity;
}
