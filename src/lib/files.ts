import path from 'node:path';
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const uploadRoot = () => process.env.UPLOAD_ROOT || path.join(process.cwd(),'uploads');
export const uploadDir = (orgId:string) => path.join(uploadRoot(),orgId);
