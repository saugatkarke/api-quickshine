import { type ZodError } from 'zod'

export type FieldErrors = Record<string, string[]>

export function formatZodFieldErrors(error: ZodError): FieldErrors {
  return error.issues.reduce<FieldErrors>((fields, issue) => {
    const field = issue.path.join('.') || 'root'
    fields[field] = [...(fields[field] ?? []), issue.message]
    return fields
  }, {})
}

export function validationErrorResponse(fields: FieldErrors) {
  return {
    error: 'Validation failed',
    message: 'Please check the highlighted fields and try again.',
    fields
  }
}
