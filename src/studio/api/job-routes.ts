// Routes of jobs: build a draft or a kit's examples as a job, read jobs, cancel one.

import { type DraftStore, loadDraft } from '../../drafts/index.ts';
import { type KitStore, loadKit } from '../../kit/index.ts';
import { type ApiRoute, apiRoute } from '../http/router.ts';
import { JobSchema } from '../jobs/job.ts';
import type { Jobs } from '../jobs/jobs.ts';
import { EmptyBody, JobListSchema, JobParams, KitParams, NoParams, SlugParams } from './schemas.ts';

export type JobRouteDeps = { drafts: DraftStore; kits: KitStore; jobs: Jobs };

const jobPath = (id: string): string => `/api/v1/jobs/${id}`;

export function jobRoutes(deps: JobRouteDeps): ApiRoute[] {
  return [
    apiRoute({
      id: 'startBuild',
      summary: 'Builds the latest version of a draft as a job. One job per draft at a time.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/builds',
      policy: 'write',
      params: SlugParams,
      request: EmptyBody,
      response: { status: 202, schema: JobSchema },
      handle: ({ params }) => {
        loadDraft(deps.drafts, params.slug);
        const job = deps.jobs.start('build', params.slug);
        return { status: 202, body: job, headers: { location: jobPath(job.id) } };
      },
    }),
    apiRoute({
      id: 'startCheck',
      summary:
        'Builds and checks the latest version of a draft as a job. One job per draft at a time.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/checks',
      policy: 'write',
      params: SlugParams,
      request: EmptyBody,
      response: { status: 202, schema: JobSchema },
      handle: ({ params }) => {
        loadDraft(deps.drafts, params.slug);
        const job = deps.jobs.start('check', params.slug);
        return { status: 202, body: job, headers: { location: jobPath(job.id) } };
      },
    }),
    apiRoute({
      id: 'startCatalog',
      summary:
        'Builds the examples of a kit for its page as a job. One catalog job per kit at a time.',
      method: 'POST',
      path: '/api/v1/kits/{id}/catalog',
      policy: 'write',
      params: KitParams,
      request: EmptyBody,
      response: { status: 202, schema: JobSchema },
      handle: ({ params }) => {
        loadKit(deps.kits, params.id);
        const job = deps.jobs.start('catalog', params.id);
        return { status: 202, body: job, headers: { location: jobPath(job.id) } };
      },
    }),
    apiRoute({
      id: 'listJobs',
      summary: 'Recent jobs, newest first.',
      method: 'GET',
      path: '/api/v1/jobs',
      policy: 'read',
      params: NoParams,
      request: null,
      response: { status: 200, schema: JobListSchema },
      handle: () => ({ status: 200, body: { items: deps.jobs.list(), nextCursor: null } }),
    }),
    apiRoute({
      id: 'getJob',
      summary: 'One job: its state, and the answer or error once it ended.',
      method: 'GET',
      path: '/api/v1/jobs/{id}',
      policy: 'read',
      params: JobParams,
      request: null,
      response: { status: 200, schema: JobSchema },
      handle: ({ params }) => ({ status: 200, body: deps.jobs.get(params.id) }),
    }),
    apiRoute({
      id: 'cancelJob',
      summary: 'Asks a running job to stop; a job event says when it did.',
      method: 'POST',
      path: '/api/v1/jobs/{id}/cancel',
      policy: 'write',
      params: JobParams,
      request: EmptyBody,
      response: { status: 202, schema: JobSchema },
      handle: ({ params }) => ({ status: 202, body: deps.jobs.cancel(params.id) }),
    }),
  ];
}
