import { z } from 'zod';

export const createJobSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  urls: z
    .array(
      z
        .string()
        .trim()
        .url('Must be a valid URL')
        .refine(
          (url) => url.startsWith('http://') || url.startsWith('https://'),
          'URL must start with http:// or https://'
        )
    )
    .min(1, 'Must provide at least 1 URL')
    .max(500, 'Cannot provide more than 500 URLs'),
  selectors: z
    .record(z.string().min(1), z.string().min(1))
    .refine(
      (obj) => Object.keys(obj).length >= 1,
      'Selectors must contain at least 1 field'
    ),
  mode: z.enum(['static', 'dynamic']).default('static'),
  schedule: z.string().nullable().optional(),
  aiFallback: z.boolean().default(false).optional(),
  runNow: z.boolean().default(true).optional(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10).optional(),
});

export const resultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  search: z.string().trim().optional(),
  sort: z.enum(['asc', 'desc']).default('desc').optional(),
});
