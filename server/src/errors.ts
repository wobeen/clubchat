export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export const notFound = () => new ApiError(404, 'not_found', '찾을 수 없어요.');
