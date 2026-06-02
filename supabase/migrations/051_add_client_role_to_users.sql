-- Migration 051: Adiciona coluna client_role para separação de nível de acesso do cliente
-- Permite definir se o operador é um administrador do cliente ('admin') ou agente comum ('agent').

ALTER TABLE panel_users
ADD COLUMN client_role text DEFAULT 'admin' CHECK (client_role IN ('admin', 'agent'));

-- Garante que todos os operadores existentes possuam 'admin' para evitar bloqueios acidentais
UPDATE panel_users
SET client_role = 'admin'
WHERE role = 'operator' AND client_role IS NULL;
