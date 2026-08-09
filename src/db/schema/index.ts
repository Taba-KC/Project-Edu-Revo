export * from './provinces';
export * from './districts';
export * from './circuits';
export * from './schools';
export * from './grades';
export * from './subjects';
export * from './streams';
export * from './streamSubjects';
export * from './classes';
export * from './classSubjects';
export * from './people';
export * from './learners';
export * from './chapters';
export * from './concepts';
export * from './lessons';
export * from './lessonConcepts';
export * from './homework';
export * from './questions';
export * from './lessonFeedback';
export * from './questionFeedback';
export * from './lessonPreviewFeedback';




/** NOTES */

/*
 * Every schema file defines and exports its table. 
 * This index.ts re-exports all of them from a single location. 
 * This means anywhere in the application that needs a table definition — a route handler, a service, a query — imports it from one place:
 
        import { lessons, homework, questions } from '../db/schema';

    - Instead of hunting through individual files:

        import { lessons } from '../db/schema/lessons';
        import { homework } from '../db/schema/homework';
        import { questions } from '../db/schema/questions';
 */