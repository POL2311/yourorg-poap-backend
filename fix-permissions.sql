-- Connect to your PostgreSQL database as a superuser (usually 'postgres')
-- and run these commands to fix permissions

-- Replace 'your_username' with your actual database username
-- You can find this in your DATABASE_URL environment variable

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO your_username;

-- Grant create privileges on schema
GRANT CREATE ON SCHEMA public TO your_username;

-- Grant all privileges on all tables in public schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_username;

-- Grant all privileges on all sequences in public schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_username;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO your_username;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO your_username;

-- If you're using a specific database name, also grant connect privileges
-- Replace 'your_database_name' with your actual database name
GRANT CONNECT ON DATABASE your_database_name TO your_username;