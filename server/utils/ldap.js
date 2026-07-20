import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  require('dotenv').config();
} catch (_) {
  // O ambiente também pode ser configurado diretamente pelo processo.
}

let ldap;
try {
  ldap = require('ldapjs');
} catch (_) {
  // Quem chamar trata a ausência e pode usar a senha administrativa configurada.
  ldap = null;
}

const LDAP_URL = process.env.LDAP_URL || 'ldap://MZ-VV-DC-002';
const LDAP_DOMAIN = process.env.LDAP_DOMAIN || 'CORP';
const LDAP_TIMEOUT = Number(process.env.LDAP_TIMEOUT || 5000);

function ldapBind(username, password) {
  if (!ldap) {
    const error = new Error('ldapjs não está instalado. Execute: npm install ldapjs');
    error.code = 'LDAPJS_NOT_INSTALLED';
    return Promise.reject(error);
  }
  if (!username || !password) {
    return Promise.reject(new Error('Credenciais LDAP ausentes'));
  }

  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: LDAP_URL,
      timeout: LDAP_TIMEOUT,
      connectTimeout: LDAP_TIMEOUT,
      reconnect: false,
    });

    const dn = `${LDAP_DOMAIN}\\${username}`;

    const onError = (error) => {
      try {
        client.unbind(() => reject(error));
      } catch (_) {
        reject(error);
      }
    };

    client.on('error', onError);

    client.bind(dn, password, (error) => {
      if (error) return onError(error);
      try {
        client.unbind(() => resolve(true));
      } catch (_) {
        resolve(true);
      }
      return undefined;
    });
  });
}

export { ldapBind, LDAP_URL, LDAP_DOMAIN, LDAP_TIMEOUT };
