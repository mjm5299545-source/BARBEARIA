ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS provider_data TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS provider_expires BIGINT;
CREATE TABLE IF NOT EXISTS customers(
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 phone TEXT UNIQUE NOT NULL CHECK(phone ~ '^[0-9]{10,15}$'),
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS appointments_customer ON appointments(customer_id,"start" DESC);
INSERT INTO customers(id,name,phone,created_at,updated_at)
 SELECT DISTINCT ON (phone) id,customer,phone,created_at,updated_at FROM appointments
 WHERE phone ~ '^[0-9]{10,15}$' ORDER BY phone,created_at DESC ON CONFLICT(phone) DO NOTHING;
UPDATE appointments a SET customer_id=c.id FROM customers c WHERE a.phone=c.phone AND a.customer_id IS NULL;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE services ADD CONSTRAINT services_price CHECK(price IS NULL OR price BETWEEN 0 AND 1000000);
ALTER TABLE services ADD CONSTRAINT services_duration CHECK(duration BETWEEN 5 AND 480);
ALTER TABLE services ADD CONSTRAINT services_kind CHECK(kind IN ('individual','combo'));
ALTER TABLE working_hours ADD CONSTRAINT hours_day CHECK(day BETWEEN 0 AND 6);
ALTER TABLE working_hours ADD CONSTRAINT hours_range CHECK("start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "start"<"end");
ALTER TABLE time_blocks ADD CONSTRAINT block_range CHECK("start"<"end");
ALTER TABLE appointments ADD CONSTRAINT appointment_range CHECK("start"<"end");
ALTER TABLE appointments ADD CONSTRAINT appointment_status CHECK(status IN ('confirmed','cancelled','completed'));
ALTER TABLE appointments ADD CONSTRAINT appointment_source CHECK(source IN ('site','manual','whatsapp'));
