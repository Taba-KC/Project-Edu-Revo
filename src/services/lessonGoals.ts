/** Count answers against the goals frozen into this particular lesson, never guessed from legacy reactions. */
export type GoalAnswer = { goalIndex: number; goal: string; answer: 'yes' | 'no' };
export function goalUnderstanding(goals: string[], rows: { learnerId: number; goalResponses: GoalAnswer[] }[], totalLearners: number) {
  return goals.map((goal, goalIndex) => {
    const answers = new Map<number, string>();
    for (const row of rows) {
      const answer = row.goalResponses.find(item => item.goalIndex === goalIndex && item.goal === goal && ['yes', 'no'].includes(item.answer));
      if (answer) answers.set(row.learnerId, answer.answer);
    }
    const yes = [...answers.values()].filter(answer => answer === 'yes').length;
    return { goalIndex, goal, yes, no: answers.size - yes, responses: answers.size, noResponse: Math.max(0, totalLearners - answers.size) };
  });
}
