import { signSuperAdminToken } from '../utils/jwt.js';

export function issueSuperAdminAccessToken(superAdmin: {
  id: string;
  email: string;
  name: string;
}) {
  return signSuperAdminToken({
    sub: superAdmin.id,
    email: superAdmin.email,
    name: superAdmin.name,
    scope: 'super_admin',
  });
}
