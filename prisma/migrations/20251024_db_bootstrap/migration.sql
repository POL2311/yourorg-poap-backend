-- 1) Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS citext;

-- 2) Permisos para el rol de la app (ajusta el rol si no es 'poap_db_user')
GRANT USAGE ON SCHEMA public TO poap_db_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO poap_db_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO poap_db_user;

-- 3) Defaults para objetos futuros
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO poap_db_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO poap_db_user;
