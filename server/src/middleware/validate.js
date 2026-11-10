import { badRequest } from '../utils/errors.js';

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = details[0];
    return next(badRequest(first ? `${first.field || 'input'}: ${first.message}` : 'Ongeldige invoer', details));
  }
  if (source === 'query') req.validQuery = result.data;
  else req[source] = result.data;
  next();
};
