/** Production must explicitly identify the browser origins that may send credentials. */
export function frontendOrigins() {
 const configured=process.env.FRONTEND_ORIGINS?.split(',').map(value=>value.trim()).filter(Boolean);
 if(process.env.NODE_ENV==='production'&&!configured?.length)throw new Error('Set FRONTEND_ORIGINS before starting production.');
 return configured?.length?configured:['http://localhost:3001','http://127.0.0.1:3001'];
}
