/** Solo desarrollo local: firma una cookie de sesion para pruebas automatizadas. */
import { SignJWT } from 'jose';

const id = process.argv[2] ?? '1';
const clave = new TextEncoder().encode('solo-para-desarrollo-local-no-usar-en-produccion');
const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(id).setIssuedAt().setExpirationTime('12h').sign(clave);
console.log(token);
