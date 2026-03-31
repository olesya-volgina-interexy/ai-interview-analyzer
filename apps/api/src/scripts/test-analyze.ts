import { analyzeInterview } from '../services/llm.service';
import type { InterviewMeta } from '@shared/schemas';

async function test() {
  const meta: InterviewMeta = {
    stage: 'technical',
    role: 'Backend',
    level: 'Middle',
    decision: 'hired',
    clientName: 'TestClient',
  };

  const result = await analyzeInterview(
    `Interviewer: Tell me about your experience with Node.js.
     Candidate: I have 3 years of experience with Node.js. I've built REST APIs using Express and Fastify, worked with PostgreSQL and Redis, implemented JWT authentication, and set up CI/CD pipelines with GitHub Actions. In my last project I optimized database queries which reduced response time by 40%.
     Interviewer: How do you handle errors in async code?
     Candidate: I use try/catch with async/await, and have a global error handler middleware in Express. For unhandled promise rejections I use process.on handler.
     Interviewer: What's your experience with microservices?
     Candidate: I've worked in a microservices architecture using RabbitMQ for messaging between services. Each service had its own database following database-per-service pattern.`,
    meta
  );

  console.log(JSON.stringify(result, null, 2));
}

test();