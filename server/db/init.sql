-- Vloženie základných používateľov, ak ešte neexistujú
INSERT INTO users (id, username, password, email, role, last_login, status)
VALUES 
  ('admin123', 'admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'admin@vozovypark.sk', 'admin', NOW(), 'active')
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (id, username, password, email, role, last_login, status)
VALUES 
  ('user123', 'user', '04f8996da763b7a969b1028ee3007569eaf3a635486ddab211d512c85b9df8fb', 'user@vozovypark.sk', 'user', NOW(), 'active')
ON CONFLICT (username) DO NOTHING;
