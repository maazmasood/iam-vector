export function assertUserScope(requestUserId, resourceUserId) {
  if (!requestUserId || requestUserId !== resourceUserId) {
    const err = new Error('Access denied — you can only access your own data');
    err.status = 403;
    throw err;
  }
}
